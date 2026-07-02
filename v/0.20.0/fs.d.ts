import { SandboxMount } from './mounts.js';
import './tasks.js';

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
interface SandboxFsPort {
    promises?: NodeFsPromises;
    readFile?: NodeFsPromises['readFile'];
}
/**
 * The resolved sandbox ZenFS, or `null` when unavailable. The ONE home for the
 * resolution order previously duplicated in every app's `mountFs.ts`:
 *
 * 1. `globalThis.__sandpackSharedFs` — the `/`-rooted bound ZenFS the sandbox publishes.
 * 2. fallback: the first `module.evaluation.module.bundler.fs.layers[].boundContext.fs`
 *    whose surface has `readFile` (the bundler ZenFS-layer bound context).
 * 3. else `null` (local `vite dev` / before boot).
 *
 * Prefer {@link openFs}; reach for this only when a system app spans mounts in absolute
 * `/mnt/{hash}` paths (the file explorer / editor).
 */
declare function sandboxFs(): SandboxFsPort | null;
/** Is the sandbox filesystem reachable at all? `false` in local `vite dev` and before
 *  boot — gate file affordances on it so an app degrades instead of throwing. */
declare function fsAvailable(): boolean;
/** A directory entry from {@link MountFs.readdir}. */
interface DirEntry {
    name: string;
    kind: 'file' | 'dir';
}
/** A stat result from {@link MountFs.stat}. */
interface FileStat {
    kind: 'file' | 'dir';
    size: number;
    mtimeMs?: number;
}
/** An error from a {@link MountFs} operation, carrying a machine-readable `.code`
 *  (mapped from the ZenFS errno) so an app branches on `.code`, never on a message. */
interface FsError extends Error {
    code: 'not-found' | 'read-only' | 'not-permitted' | 'exists' | 'not-empty' | 'invalid-path' | 'unavailable' | 'unknown';
}
/**
 * Best-effort MIME type from a filename's extension — mainly image kinds
 * (png/jpg/jpeg/gif/webp/avif/svg/bmp/ico). Returns `undefined` when the
 * extension isn't recognized (the caller falls back to `application/octet-stream`).
 * Used by {@link MountFs.readBlob} / {@link MountFs.readObjectUrl}; exported so an
 * app can label a Blob it builds itself.
 */
declare function mimeTypeFor(path: string): string | undefined;
/** A mount-anchored, typed filesystem view. All paths are RELATIVE to the mount root;
 *  the accessor resolves them under `mount.path`. Async-only (ZenFS rides a MessagePort).
 *  Obtain one with {@link openFs}. */
interface MountFs {
    /** The mount this view is anchored to (read `mode`/`rules` for writability). */
    readonly mount: SandboxMount;
    /** Read a file as UTF-8 text (`encoding: 'utf8'`) or raw bytes (omit encoding). */
    readFile(relPath: string, encoding: 'utf8'): Promise<string>;
    readFile(relPath: string): Promise<Uint8Array>;
    /** Read a file's bytes as a `Blob`, tagged with a MIME `type` inferred from the
     *  extension ({@link mimeTypeFor}) or `opts.type` when given (falls back to
     *  `application/octet-stream`). The building block for downloads and object URLs. */
    readBlob(relPath: string, opts?: {
        type?: string;
    }): Promise<Blob>;
    /** Read a file into an **object URL** suitable for `<img src>` / `<a href>` — the
     *  fix for "an opaque-origin iframe can't fetch a mount path". Returns the `url`
     *  and a `revoke()` you MUST call when done (typically on unmount) or the URL
     *  leaks. Prefer the `useObjectUrl` hook / `MountImage` component, which revoke
     *  for you; reach for this directly only outside React. */
    readObjectUrl(relPath: string, opts?: {
        type?: string;
    }): Promise<{
        url: string;
        revoke: () => void;
    }>;
    /** Write text or bytes, creating or truncating the file. Throws `read-only` on a `ro` mount. */
    writeFile(relPath: string, data: string | Uint8Array): Promise<void>;
    /** List a directory (the mount root when `relPath` is omitted). */
    readdir(relPath?: string): Promise<DirEntry[]>;
    /** Stat a path. Throws `not-found` if absent. */
    stat(relPath: string): Promise<FileStat>;
    /** Does `relPath` exist? Never throws on absence. */
    exists(relPath: string): Promise<boolean>;
    /** Create a directory (pass `{ recursive: true }` to make parents). */
    mkdir(relPath: string, opts?: {
        recursive?: boolean;
    }): Promise<void>;
    /** Remove a file, or a directory with `{ recursive: true }`. */
    rm(relPath: string, opts?: {
        recursive?: boolean;
    }): Promise<void>;
    /** Rename/move within the mount. */
    rename(fromRel: string, toRel: string): Promise<void>;
    /** Client-side writability hint for `relPath` (mount `mode` ∩ longest-matching `rule`),
     *  so an app can hide an "edit" affordance instead of catching `read-only`
     *  (EDITOR_FIRST_EDITING_SPEC §3). Re-evaluate on `onMountsChange` — a role downgrade
     *  flips it. EROFS from the host stays authoritative. */
    canWrite(relPath?: string): boolean;
}
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
 * Throws {@link FsError} `unavailable` if the sandbox fs is not present (local `vite dev`
 * / before boot — gate with {@link fsAvailable}). Per-op failures throw {@link FsError}
 * with a mapped `.code` (`not-found`, `read-only`, …).
 */
declare function openFs(mount: SandboxMount): MountFs;
/** Open a mount-anchored view of this app's OWN repository working tree — a convenience
 *  over {@link openFs} using `getAppMountPath()` (FILE_SHARING_SPEC §11.2). */
declare function openAppFs(): MountFs;

export { type DirEntry, type FileStat, type FsError, type MountFs, type SandboxFsPort, fsAvailable, mimeTypeFor, openAppFs, openFs, sandboxFs };
