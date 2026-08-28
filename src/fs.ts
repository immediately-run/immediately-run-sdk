// Typed, discoverable filesystem access — the app-facing surface for the ZenFS
// mount ports (SDK_FS_SURFACE_SPEC; FILESYSTEM_SPEC §2 the ZenFS-shaped contract).
//
// The single most important thing an app does — read/write files in its mounts —
// previously had NO SDK surface: apps reached an ambient `globalThis.__sandpackSharedFs`
// by hand-rolling the same accessor (editor/file-explorer `src/fs/mountFs.ts`, "keep the
// two in sync"), with a documented footgun (`module.evaluation.module.bundler.fs` is the
// WRONG object — it has no `promises`/`stat`). This module is that accessor's ONE home,
// typed and documented.
//
// It adds NO authority: the ZenFS port is already minted and chroot/`ro`-enforced
// host-side (FILESYSTEM_SPEC §2, UI_AS_APPS §8.7). This is typing + discoverability +
// de-duplication only. `fs` is a Resource PORT (a byte channel), not a host-brokered RPC,
// so — unlike the `invoke()` catalog surface — it is hand-written, not gate-table-derived.
import type { SandboxMount, MountRule } from './mounts';
import { getAppMountPath } from './mounts';
import { onFsChange } from './onFsChange';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The node-compatible promises surface the sandbox ZenFS exposes (the subset we use). */
interface NodeFsPromises {
  readFile(path: string, encoding?: any): Promise<string | Uint8Array>;
  writeFile(path: string, data: string | Uint8Array): Promise<void>;
  readdir(path: string, opts?: any): Promise<any[]>;
  stat(path: string): Promise<any>;
  mkdir(path: string, opts?: any): Promise<unknown>;
  rm(path: string, opts?: any): Promise<void>;
  rename(from: string, to: string): Promise<void>;
}

/** The resolved sandbox ZenFS handle (node-compatible, `/`-rooted). Opaque to apps —
 *  reach it through {@link openFs}; the raw handle is the {@link sandboxFs} escape hatch. */
export interface SandboxFsPort {
  promises?: NodeFsPromises;
  readFile?: NodeFsPromises['readFile'];
}

const hasFs = (fs: any): boolean => typeof fs?.promises?.readFile === 'function' || typeof fs?.readFile === 'function';

/**
 * The resolved sandbox ZenFS, or `null` when unavailable. The ONE home for the
 * resolution order previously duplicated in every app's `mountFs.ts`:
 *
 * 1. `globalThis.__sandpackSharedFs` — the `/`-rooted bound ZenFS the sandbox publishes.
 * 2. fallback: the first `module.evaluation.module.bundler.fs.layers[].boundContext.fs`
 *    whose surface has `readFile` (the bundler ZenFS-layer bound context).
 * 3. else `null` (plain local `vite dev` / before boot).
 *
 * Under `vite dev` WITH the `@immediately-run/dev-fs` plugin (>= 0.5.0), step 1
 * resolves: the plugin publishes its local-disk fs bridge at the same
 * `__sandpackSharedFs` global, so `openFs` / `readBlob` / `readObjectUrl` /
 * `useObjectUrl` work locally through this existing path with no special-casing.
 * Without the plugin they fail with `unavailable`.
 *
 * Prefer {@link openFs}; reach for this only when a system app spans mounts in absolute
 * `/mnt/{hash}` paths (the file explorer / editor).
 */
export function sandboxFs(): SandboxFsPort | null {
  try {
    const shared = (globalThis as any).__sandpackSharedFs;
    if (hasFs(shared)) return shared as SandboxFsPort;
  } catch {
    /* not in the sandbox */
  }
  try {
    // @ts-ignore - `module` is injected by the sandbox runtime (see sandboxUtils transport).
    // DEPRECATION WINDOW (opened 2026-08-25, R3-278): this `bundler.fs.layers` fallback
    // is injected-bundler API reading — the supported surface is the
    // `__sandpackSharedFs` discovery global above (and `openFs`/`sandboxFs` themselves).
    // Kept through the SDK_PACKAGING_SPEC §9 window; new code must not read bundler.*
    // (scripts/check-bundler-reads.mjs).
    const layers = module?.evaluation?.module?.bundler?.fs?.layers;
    if (Array.isArray(layers)) {
      for (const layer of layers) {
        const fs = layer?.boundContext?.fs;
        if (hasFs(fs)) return fs as SandboxFsPort;
      }
    }
  } catch {
    /* not in the sandbox */
  }
  return null;
}

/** Is the sandbox filesystem reachable at all? `false` in plain local `vite dev` and
 *  before boot — gate file affordances on it so an app degrades instead of throwing.
 *  `true` under `vite dev` with the `@immediately-run/dev-fs` plugin (>= 0.5.0),
 *  which publishes its bridge where {@link sandboxFs} discovers it. */
export function fsAvailable(): boolean {
  return sandboxFs() != null;
}

/** A directory entry from {@link MountFs.readdir}. */
export interface DirEntry {
  name: string;
  kind: 'file' | 'dir';
}

/** A stat result from {@link MountFs.stat}. */
export interface FileStat {
  kind: 'file' | 'dir';
  size: number;
  mtimeMs?: number;
}

/** An error from a {@link MountFs} operation, carrying a machine-readable `.code`
 *  (mapped from the ZenFS errno) so an app branches on `.code`, never on a message. */
export interface FsError extends Error {
  code:
    | 'not-found' // ENOENT
    | 'read-only' // EROFS — a `ro` mount / downgraded role; NEVER surface as UX (gate with canWrite)
    | 'not-permitted' // EACCES
    | 'exists' // EEXIST
    | 'not-empty' // ENOTEMPTY
    | 'invalid-path' // a `..` segment / absolute escape was passed as a relPath
    | 'unavailable' // no sandbox fs (local dev / pre-boot)
    | 'unknown';
}

const ERRNO: Record<string, FsError['code']> = {
  ENOENT: 'not-found',
  EROFS: 'read-only',
  EACCES: 'not-permitted',
  EPERM: 'not-permitted',
  EEXIST: 'exists',
  ENOTEMPTY: 'not-empty',
};

const fsError = (code: FsError['code'], message: string): FsError => {
  const err = new Error(message) as FsError;
  err.code = code;
  return err;
};

const mapError = (e: unknown): FsError => {
  const errno = (e as { code?: string } | null)?.code;
  const code: FsError['code'] = (errno ? ERRNO[errno] : undefined) ?? 'unknown';
  const err = new Error((e as Error)?.message ?? 'fs operation failed') as FsError;
  err.code = code;
  return err;
};

// Lazily constructed so merely *importing* this module doesn't touch the
// TextEncoder/TextDecoder globals — some non-DOM test/build environments only
// provide them on demand, and no image/URL path needs them at all.
let _decoder: TextDecoder | undefined;
let _encoder: TextEncoder | undefined;
const decoder = (): TextDecoder => (_decoder ??= new TextDecoder());
const encoder = (): TextEncoder => (_encoder ??= new TextEncoder());

// Extension → MIME type for the kinds an app displays inline. Images first (the
// common case — `<img src>` off a mount), plus a couple of adjacent binary kinds.
// Deliberately small: `mimeTypeFor` returns undefined for anything not here and
// callers fall back to `application/octet-stream`.
const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
};

/**
 * Best-effort MIME type from a filename's extension — mainly image kinds
 * (png/jpg/jpeg/gif/webp/avif/svg/bmp/ico). Returns `undefined` when the
 * extension isn't recognized (the caller falls back to `application/octet-stream`).
 * Used by {@link MountFs.readBlob} / {@link MountFs.readObjectUrl}; exported so an
 * app can label a Blob it builds itself.
 */
export function mimeTypeFor(path: string): string | undefined {
  const dot = path.lastIndexOf('.');
  if (dot < 0) return undefined;
  return MIME_BY_EXT[path.slice(dot + 1).toLowerCase()];
}

// Join a mount-RELATIVE path under the mount root, rejecting `..` escapes and absolute
// paths (CLAUDE.md security rule 3 — don't probe for escapes). The host chroot is the
// real enforcer; this keeps an honest app from accidentally naming outside its grant.
const resolveUnder = (root: string, relPath: string): string => {
  if (relPath.startsWith('/')) {
    throw fsError('invalid-path', `expected a mount-relative path, got absolute "${relPath}"`);
  }
  const parts: string[] = [];
  for (const seg of relPath.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      throw fsError('invalid-path', `"${relPath}" escapes the mount root`);
    }
    parts.push(seg);
  }
  const base = root.endsWith('/') ? root.slice(0, -1) : root;
  return parts.length ? `${base}/${parts.join('/')}` : base;
};

// The longest matching `rules` subtree governs a path (mounts.ts MountRule); fall back to
// the whole-mount `mode`. A CLIENT-SIDE hint mirroring the host rule — EROFS stays
// authoritative (the host re-checks live policy on every write).
const writableAt = (mount: SandboxMount, relPath: string): boolean => {
  const path =
    '/' +
    relPath
      .split('/')
      .filter((s) => s && s !== '.')
      .join('/');
  const rules: MountRule[] | undefined = mount.rules;
  if (rules && rules.length) {
    let best: MountRule | undefined;
    for (const r of rules) {
      const sub = r.subtree.endsWith('/') ? r.subtree : r.subtree + '/';
      if (path === r.subtree || path.startsWith(sub) || r.subtree === '/') {
        if (!best || r.subtree.length > best.subtree.length) best = r;
      }
    }
    if (best) return best.mode === 'rw';
  }
  return (mount.mode ?? 'rw') === 'rw';
};

/** A mount-anchored, typed filesystem view. All paths are RELATIVE to the mount root;
 *  the accessor resolves them under `mount.path`. Async-only (ZenFS rides a MessagePort).
 *  Obtain one with {@link openFs}. */
export interface MountFs {
  /** The mount this view is anchored to (read `mode`/`rules` for writability). */
  readonly mount: SandboxMount;
  /** Read a file as UTF-8 text (`encoding: 'utf8'`) or raw bytes (omit encoding). */
  readFile(relPath: string, encoding: 'utf8'): Promise<string>;
  readFile(relPath: string): Promise<Uint8Array>;
  /** Read a file's bytes as a `Blob`, tagged with a MIME `type` inferred from the
   *  extension ({@link mimeTypeFor}) or `opts.type` when given (falls back to
   *  `application/octet-stream`). The building block for downloads and object URLs. */
  readBlob(relPath: string, opts?: { type?: string }): Promise<Blob>;
  /** Read a file into an **object URL** suitable for `<img src>` / `<a href>` — the
   *  fix for "an opaque-origin iframe can't fetch a mount path". Returns the `url`
   *  and a `revoke()` you MUST call when done (typically on unmount) or the URL
   *  leaks. Prefer the `useObjectUrl` hook / `MountImage` component, which revoke
   *  for you; reach for this directly only outside React. */
  readObjectUrl(relPath: string, opts?: { type?: string }): Promise<{ url: string; revoke: () => void }>;
  /** Write text or bytes, creating or truncating the file. Throws `read-only` on a `ro` mount. */
  writeFile(relPath: string, data: string | Uint8Array): Promise<void>;
  /** List a directory (the mount root when `relPath` is omitted). */
  readdir(relPath?: string): Promise<DirEntry[]>;
  /** Stat a path. Throws `not-found` if absent. */
  stat(relPath: string): Promise<FileStat>;
  /** Does `relPath` exist? Never throws on absence. */
  exists(relPath: string): Promise<boolean>;
  /** Create a directory (pass `{ recursive: true }` to make parents). */
  mkdir(relPath: string, opts?: { recursive?: boolean }): Promise<void>;
  /** Remove a file, or a directory with `{ recursive: true }`. */
  rm(relPath: string, opts?: { recursive?: boolean }): Promise<void>;
  /** Rename/move within the mount. */
  rename(fromRel: string, toRel: string): Promise<void>;
  /** Client-side writability hint for `relPath` (mount `mode` ∩ longest-matching `rule`),
   *  so an app can hide an "edit" affordance instead of catching `read-only`
   *  (EDITOR_FIRST_EDITING_SPEC §3). Re-evaluate on `onMountsChange` — a role downgrade
   *  flips it. EROFS from the host stays authoritative. */
  canWrite(relPath?: string): boolean;
  /** Subscribe to changes to files in this mount — the mount-scoped projection of
   *  the host working-tree change stream (`onFsChange`), so a viewer re-reads an
   *  affected file instead of polling (SDK_FS_SURFACE_SPEC §5). The callback gets
   *  the changed paths RELATIVE to this mount (feed them straight back into
   *  `readFile`/`stat`/…). Returns an unsubscribe fn.
   *
   *  **Working-tree-only in v1 (an honest gap, O2):** the host push channel carries
   *  only working-tree changes, so `onChange` on a NON-working-tree mount (a space)
   *  is an inert subscription that never fires until that channel lands. Like
   *  `onFsChange`, origin-exclusion (ignoring the echo of your own write) is the
   *  caller's responsibility. */
  onChange(cb: (changedRelPaths: string[]) => void): () => void;
}

const promisesOf = (port: SandboxFsPort): NodeFsPromises => port.promises ?? (port as unknown as NodeFsPromises);

/**
 * Open a typed, mount-anchored filesystem view (SDK_FS_SURFACE_SPEC §2.1). Pure-client:
 * resolves the ambient ZenFS once ({@link sandboxFs}) and binds it to `mount.path`, so you
 * read/write with paths RELATIVE to the mount root — you cannot accidentally name a path
 * outside your grant (a `..`/absolute path throws `invalid-path`; the host chroot is the
 * real enforcer).
 *
 * ```ts
 * import { mountSpace } from '@immediately-run/sdk';
 * import { openFs } from '@immediately-run/sdk/fs';
 * const fs = openFs(await mountSpace({ spaceId }));
 * const text = await fs.readFile('notes/idea.mdx', 'utf8');
 * if (fs.canWrite('notes/idea.mdx')) await fs.writeFile('notes/idea.mdx', text);
 * ```
 *
 * Throws {@link FsError} `unavailable` if the sandbox fs is not present (plain local
 * `vite dev` / before boot — gate with {@link fsAvailable}; under `vite dev` the
 * `@immediately-run/dev-fs` plugin >= 0.5.0 provides it, see {@link sandboxFs}).
 * Per-op failures throw {@link FsError} with a mapped `.code` (`not-found`,
 * `read-only`, …).
 */
export function openFs(mount: SandboxMount): MountFs {
  const root = mount.path;

  const port = (): NodeFsPromises => {
    const p = sandboxFs();
    if (!p) throw fsError('unavailable', 'immediately.run: sandbox filesystem unavailable');
    return promisesOf(p);
  };

  const api: MountFs = {
    mount,
    async readFile(relPath: string, encoding?: 'utf8'): Promise<any> {
      const p = port();
      const abs = resolveUnder(root, relPath);
      try {
        const data = await p.readFile(abs);
        const bytes = typeof data === 'string' ? encoder().encode(data) : (data as Uint8Array);
        return encoding === 'utf8' ? decoder().decode(bytes) : bytes;
      } catch (e) {
        throw mapError(e);
      }
    },
    async readBlob(relPath, opts) {
      const bytes = await api.readFile(relPath);
      const type = opts?.type ?? mimeTypeFor(relPath) ?? 'application/octet-stream';
      return new Blob([bytes as BlobPart], { type });
    },
    async readObjectUrl(relPath, opts) {
      const blob = await api.readBlob(relPath, opts);
      const url = URL.createObjectURL(blob);
      return { url, revoke: () => URL.revokeObjectURL(url) };
    },
    async writeFile(relPath, data) {
      const p = port();
      const abs = resolveUnder(root, relPath);
      try {
        await p.writeFile(abs, typeof data === 'string' ? encoder().encode(data) : data);
      } catch (e) {
        throw mapError(e);
      }
    },
    async readdir(relPath = '') {
      const p = port();
      const abs = resolveUnder(root, relPath);
      try {
        const entries = await p.readdir(abs, { withFileTypes: true });
        return entries.map((d: any) =>
          typeof d === 'string'
            ? ({ name: d, kind: 'file' } as DirEntry)
            : ({ name: d.name, kind: d.isDirectory?.() ? 'dir' : 'file' } as DirEntry),
        );
      } catch (e) {
        throw mapError(e);
      }
    },
    async stat(relPath) {
      const p = port();
      const abs = resolveUnder(root, relPath);
      try {
        const s: any = await p.stat(abs);
        return {
          kind: s.isDirectory?.() ? 'dir' : 'file',
          size: typeof s.size === 'number' ? s.size : 0,
          mtimeMs: typeof s.mtimeMs === 'number' ? s.mtimeMs : undefined,
        };
      } catch (e) {
        throw mapError(e);
      }
    },
    async exists(relPath) {
      try {
        await api.stat(relPath);
        return true;
      } catch (e) {
        if ((e as FsError).code === 'not-found') return false;
        if ((e as FsError).code === 'unavailable' || (e as FsError).code === 'invalid-path') {
          throw e;
        }
        return false;
      }
    },
    async mkdir(relPath, opts) {
      const p = port();
      const abs = resolveUnder(root, relPath);
      try {
        await p.mkdir(abs, { recursive: opts?.recursive ?? false });
      } catch (e) {
        throw mapError(e);
      }
    },
    async rm(relPath, opts) {
      const p = port();
      const abs = resolveUnder(root, relPath);
      try {
        await p.rm(abs, { recursive: opts?.recursive ?? false });
      } catch (e) {
        throw mapError(e);
      }
    },
    async rename(fromRel, toRel) {
      const p = port();
      const from = resolveUnder(root, fromRel);
      const to = resolveUnder(root, toRel);
      try {
        await p.rename(from, to);
      } catch (e) {
        throw mapError(e);
      }
    },
    canWrite(relPath = '') {
      return writableAt(mount, relPath);
    },
    onChange(cb) {
      // §5 — mount-scoped projection of the working-tree change channel
      // (`onFsChange`). v1 is WORKING-TREE-ONLY: the host pushes only working-tree
      // changes, so a non-working-tree mount (a space) has no channel yet (O2) and
      // gets an inert subscription rather than another mount's paths leaking in.
      if (root !== getAppMountPath()) {
        return () => {}; // no channel for this mount — inert (honest v1 gap)
      }
      return onFsChange((change) => {
        // Skip the empty pre-first-event initial batch; forward only real changes,
        // as mount-relative paths (drop the repo-relative leading slash) so they
        // feed straight back into readFile/stat/etc.
        if (change.paths.length === 0) return;
        cb(change.paths.map((p) => p.replace(/^\/+/, '')));
      });
    },
  };
  return api;
}

/** Open a mount-anchored view of this app's OWN repository working tree — a convenience
 *  over {@link openFs} using `getAppMountPath()` (FILE_SHARING_SPEC §11.2). */
export function openAppFs(): MountFs {
  return openFs({ path: getAppMountPath(), type: 'repo' } as SandboxMount);
}
