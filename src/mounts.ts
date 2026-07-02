import { useEffect, useState } from 'react';
import { protocolRequest, sendMessage, addListener } from './sandboxUtils';
import { createPushChannel } from './pushChannel';
import { getHostRuntime } from './hostRuntime';
import { mountMatches } from './mountMatch';
// Type-only: `tasks.ts` registers a host listener at module load, so we reuse the
// FileCap SHAPE without pulling that side effect into every `mounts` importer.
import type { FileCap } from './tasks';

/**
 * The absolute path where this app's own repository filesystem is mounted
 * (FILE_SHARING_SPEC §11.2). Prefer this over hardcoding `/app`: the repo is
 * dual-mounted at both `/app` (back-compat) and its canonical `/mnt/{hash}`
 * address, and this returns the canonical one the host reports. Falls back to
 * `/app` when the host hasn't reported a canonical path (older host / before the
 * report arrives) — both paths are live, so either resolves the same files.
 */
export const getAppMountPath = (): string => getHostRuntime()?.appMountPath ?? '/app';

/**
 * A filesystem mount available to the sandbox, mirrored from the host window.
 *
 * Mounts appear on demand — call {@link openSettings} for this app's own settings,
 * or {@link mountSpace} / {@link requestMount} to mount a Firestore-backed "space".
 * Read or subscribe to the set, then access the files through the `fs` module at
 * the mount's `path`.
 */
export interface SandboxMount {
  /** Absolute path where the mount is reachable (e.g. `/spaces/{id}`). */
  path: string;
  /** Backend kind, e.g. `'firestore'`. */
  type: string;
  /** Optional stable identifier (the spaceId, for spaces). */
  id?: string;
  /**
   * Access mode of the granted view: `'rw'` (read-write) or `'ro'` (read-only).
   * A live role downgrade re-announces the same mount with `mode: 'ro'`; apps
   * observing `onMountsChange` see the change and writes start failing `EROFS`.
   * Absent on the primary repo mount (treated as read-write).
   */
  mode?: "ro" | "rw";
  /**
   * Human-readable label for the mount — the space's display name, or the repo
   * label for the primary working-tree mount (R3-69). Use this to show users and
   * agents *what* a mount is: the `path` (`/mnt/{hash}`) and `id` (the spaceId)
   * are opaque, and space names are not unique, so neither alone tells you which
   * filesystem you're looking at. Absent when the host can't resolve a name
   * (older host, or a name it never learned) — fall back to `id`/`path`.
   */
  name?: string;
  /**
   * The granted scopes of this mount (plan 12 §8.7 / §F): each `{subtree, mode}`
   * is a path prefix you hold and at what access, at the mount's backend-natural
   * paths. Use it to reason about per-path writability — which subtree is `rw` —
   * WITHOUT probing `EROFS`. A single whole-mount grant is `[{ subtree: '/', mode }]`.
   * Absent on the primary repo mount and on an older host that doesn't report it.
   */
  rules?: MountRule[];
}

/** One granted scope of a mount (plan 12 §F): a backend-natural path prefix and
 *  the access mode there. The most specific (longest) matching rule governs a path. */
export interface MountRule {
  subtree: string;
  mode: 'ro' | 'rw';
}

/**
 * Why a mounted filesystem was removed, surfaced on the removed descriptor so an
 * app can say *why* it vanished instead of failing mutely (auth-mount §"mount-remove"
 * / AM2-4):
 * - `revoked` — a durable grant was revoked (revokeGrant / consent withdrawal);
 * - `unshared` — the granting user's membership was removed (or downgraded out);
 * - `signed-out` — sign-out tore down every mount;
 * - `unmounted` — the app's own `unmountSpace` (or region teardown);
 * - `deleted` — the space was soft-deleted.
 * An older host that sends no reason is read as `'revoked'` (most conservative).
 */
export type MountRemoveReason =
  | "revoked"
  | "unshared"
  | "signed-out"
  | "unmounted"
  | "deleted";

/** A descriptor delivered as REMOVED to a mounts-change listener: the mount that
 *  went away, plus the `reason` it did. */
export interface RemovedMount extends SandboxMount {
  reason: MountRemoveReason;
}

interface MountService {
  getMounts(): SandboxMount[];
  onChange(
    listener: (mounts: SandboxMount[], removed: RemovedMount[]) => void,
  ): { dispose(): void };
}

// The stable key of a mount: its `id` (spaceId) when present, else its `path`.
// Matches the sandbox `MountService.mountKey` so add/replace/remove agree on both
// sides of the wire (a role downgrade re-announces the SAME key with `mode: 'ro'`).
const mountKey = (m: SandboxMount): string => m.id ?? m.path;

const MOUNT_REMOVE_REASONS: ReadonlySet<string> = new Set<MountRemoveReason>([
  'revoked',
  'unshared',
  'signed-out',
  'unmounted',
  'deleted',
]);

// Normalize an over-the-wire `mount-remove` reason; an absent/unknown value (older
// host) reads as `'revoked'`, the most conservative reading (mirrors the sandbox).
const asMountRemoveReason = (value: unknown): MountRemoveReason =>
  typeof value === 'string' && MOUNT_REMOVE_REASONS.has(value)
    ? (value as MountRemoveReason)
    : 'revoked';

// The injected sandbox-bundler mount service (`module.evaluation.module.bundler.mounts`),
// or null when the SDK is npm-fetched with no injection — same dual-mode shape as
// `sandboxUtils.transport()` and the metadata emitter (SDK_PACKAGING_SPEC §4/§8).
const injectedMountService = (): MountService | null => {
  try {
    // @ts-ignore - injected by the sandbox runtime
    const svc = module?.evaluation?.module?.bundler?.mounts;
    return svc && typeof svc.getMounts === 'function' ? svc : null;
  } catch {
    return null;
  }
};

// Transport-backed descriptor cache (R3-51b): the npm-fetched fallback that builds
// the same `getMounts()`/`onChange()` view the injected `bundler.mounts` provides,
// directly from the host's `mount-add`/`mount-remove` messages over the §4 transport.
// The host already posts these (it's how the in-iframe bundler service is populated);
// the `MessagePort` a `mount-add` transfers is consumed by the sandbox runtime to wire
// ZenFS and is irrelevant here — the SDK only mirrors the *descriptors*. A lazy
// singleton so `getMounts`/`onMountsChange` share one cache, one subscription, and one
// `request-mounts` replay (the host re-announces every current mount, like a poll).
let transportSvc: MountService | null = null;

const transportMountService = (): MountService => {
  if (transportSvc) return transportSvc;
  let mounts: SandboxMount[] = [];
  const listeners = new Set<(m: SandboxMount[], r: RemovedMount[]) => void>();
  const fire = (removed: RemovedMount[]) => {
    for (const l of [...listeners]) l(mounts, removed);
  };

  addListener('mount-add', (msg: Record<string, any>) => {
    const mount: SandboxMount | undefined = msg.mount;
    if (!mount) return;
    const key = mountKey(mount);
    mounts = [...mounts.filter((m) => mountKey(m) !== key), mount];
    fire([]);
  });
  addListener('mount-remove', (msg: Record<string, any>) => {
    const key: string | undefined = msg.id ?? msg.path;
    if (key == null) return;
    const reason = asMountRemoveReason(msg.reason);
    const removed = mounts.filter((m) => mountKey(m) === key).map((m) => ({ ...m, reason }));
    if (removed.length === 0) return;
    mounts = mounts.filter((m) => mountKey(m) !== key);
    fire(removed);
  });

  // Ask the host to replay the current set (the matching `mount-add`s may have been
  // sent before this SDK subscribed). Best-effort: a transport not yet ready throws.
  try {
    sendMessage('request-mounts');
  } catch {
    /* transport not ready — the live mount-add stream still populates the cache */
  }

  transportSvc = {
    getMounts: () => mounts,
    onChange: (listener) => {
      listeners.add(listener);
      listener(mounts, []); // immediate replay to the new subscriber
      return { dispose: () => listeners.delete(listener) };
    },
  };
  return transportSvc;
};

// Phase-5 dual mode: prefer the injected bundler service (the live path, behaviour
// byte-for-byte unchanged); fall back to the transport-built cache when npm-fetched.
const mountService = (): MountService => injectedMountService() ?? transportMountService();

/** A predicate-style matcher for {@link findMount} / {@link waitForMount}. Any
 *  combination of coordinates; `name` matches the human-readable mount label. */
export type MountQuery = { type?: string; id?: string; path?: string; name?: string };

const matches = (mount: SandboxMount, query: MountQuery): boolean =>
  mountMatches(mount, query);

/**
 * Returns the mounts currently available. Poll this whenever you need a one-off
 * read; use {@link onMountsChange} or {@link useMounts} to react to changes.
 * Each descriptor carries its `id` (the spaceId), `path` (`/mnt/{hash}`) and —
 * when the host can resolve it — a human-readable `name` (R3-69), so this doubles
 * as a queryable mount→space mapping for showing or locating a mount by name.
 */
export const getMounts = (): SandboxMount[] => mountService().getMounts();

/** Returns the first mount matching `query`, or `undefined`. */
export const findMount = (query: MountQuery): SandboxMount | undefined =>
  getMounts().find((m) => matches(m, query));

/**
 * Subscribe to mount changes. The listener is invoked immediately with the
 * current mounts (and an empty `removed`), then again on every change. The second
 * argument carries the descriptors REMOVED by that change, each with its `reason`
 * (AM2-4) — so an app can react to *why* a mount vanished (e.g. tell the user a
 * shared space was `unshared` vs `deleted`). It is empty on adds and on the
 * initial replay. Returns an unsubscribe fn.
 */
export const onMountsChange = (
  listener: (mounts: SandboxMount[], removed: RemovedMount[]) => void,
): (() => void) => {
  const disposable = mountService().onChange(listener);
  return () => disposable.dispose();
};

/**
 * Resolves once a mount matching `query` is present (immediately if it already
 * is). Handy for "use it when it appears" — e.g.
 * `await waitForMount({ type: 'firestore' })` before reading `/firestore`.
 */
export const waitForMount = (query: MountQuery): Promise<SandboxMount> =>
  new Promise((resolve) => {
    const unsubscribe = onMountsChange((mounts) => {
      const found = mounts.find((m) => matches(m, query));
      if (found) {
        // Defer unsubscribe so we don't dispose during the initial replay call.
        Promise.resolve().then(unsubscribe);
        resolve(found);
      }
    });
  });

/** React hook returning the mounts currently available, re-rendering on change. */
export const useMounts = (): SandboxMount[] => {
  const [mounts, setMounts] = useState<SandboxMount[]>(getMounts);
  useEffect(() => onMountsChange(setMounts), []);
  return mounts;
};

// ---------------------------------------------------------------------------
// Spaces — on-demand, shareable Firestore-backed filesystems.
// The host owns all UX: if you aren't signed in, or the space doesn't exist or
// isn't accessible, the parent window presents sign-in / create / request-access
// and only then resolves these calls. See docs/specs/FILE_SHARING_SPEC.md.
// ---------------------------------------------------------------------------

/** Summary of a space, as returned by {@link listSpaces}. */
export interface SpaceInfo {
  spaceId: string;
  role?: 'owner' | 'writer' | 'reader';
  owner?: string;
  name?: string;
}

/** An error from a space operation, carrying a machine-readable `code`. */
export interface SpaceError extends Error {
  code:
    | 'auth-required'
    | 'cancelled'
    | 'forbidden'
    | 'not-found'
    | 'unsupported-scheme'
    | 'unknown';
}

type SpaceResult =
  | { ok: true; data: unknown }
  | { ok: false; code: string; message: string };

// Issue a spaces protocol request, unwrapping the host's {ok,data} envelope and
// throwing a typed SpaceError on failure.
const request = async <T = unknown>(
  method: string,
  query: Record<string, unknown> = {},
): Promise<T> => {
  const res = (await protocolRequest('spaces', method, [query])) as SpaceResult;
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? 'space request failed') as SpaceError;
    err.code = (res?.code as SpaceError['code']) ?? 'unknown';
    throw err;
  }
  return res.data as T;
};

// Request a space mount, then wait until the host actually registers it. The
// host announces the mount (`mount-add`) separately from the protocol reply, so
// an immediate read could otherwise race the mount.
const requestMountInternal = async (
  method: string,
  query: Record<string, unknown>,
): Promise<SandboxMount> => {
  const mount = await request<SandboxMount>(method, query);
  return waitForMount({ id: mount.id ?? mount.path });
};

/**
 * Mount a filesystem by its **universal mount id** (UI_AS_APPS_SPEC §3.5) —
 * `scheme:locator`, e.g. `space:{spaceId}` or `github:owner/repo@ref`. Backend-blind:
 * the host resolves the scheme. A scheme with no resolver rejects with
 * {@link SpaceError} `unsupported-scheme`.
 */
export const mount = (mountId: string): Promise<SandboxMount> =>
  requestMountInternal('mount', { mount: mountId });

/** Mount a specific space by id (e.g. one shared with you, or from a link). A thin
 *  shim over {@link mount} with the `space:` scheme. */
export const mountSpace = (query: { spaceId: string }): Promise<SandboxMount> =>
  mount(`space:${query.spaceId}`);

/**
 * Ask the user to grant a filesystem to this app — the §8.6 powerbox. The app
 * asks; the HOST shows the user their spaces and, for the chosen one, its PROJECT
 * FOLDERS (§8.7). The user picks ONE project — so a shared space opens scoped to
 * just that project, never the whole space — and makes an EXPLICIT read-only vs
 * read-write decision (there is no default). The app never sees the list; it
 * resolves with the single granted mount, or rejects with a {@link SpaceError}
 * (`cancelled`) if declined. The granted scope is enforced host-side: the mount
 * is chroot'd to the project folder and `ro`-limited accordingly, so paths
 * outside the project are unnameable and writes on a `ro` grant fail `EROFS`.
 *
 * A project folder is the macOS-bundle-like unit an app works in inside a space;
 * the host records which app a folder belongs to (a `.immediately.run/` sidecar),
 * so the picker can surface the app's own projects or let the user create a new
 * one. Observe the granted access via {@link SandboxMount.mode}.
 *
 * Backend-general (§3.5): the picker offers whatever mounts the user has (today,
 * their spaces). Returns the granted mount by its universal id.
 */
export const requestMount = (): Promise<SandboxMount> =>
  requestMountInternal('request', {});

/** Prompt the user to grant a mount, returning the granted {@link SandboxMount}.
 *  @deprecated renamed to {@link requestMount} (backend-general, §3.5). */
export const requestSpace = requestMount;

// ── content references (plan 12 §E / FILE_SHARING §7) ────────────────────────

/**
 * Build a persisted CONTENT REFERENCE to a file in a mount — a `{mountId, relPath}`
 * pointer your app serializes into ITS OWN content (a board's JSON, an MDX file's
 * frontmatter, an album manifest — the platform doesn't dictate the container) so a
 * later viewer can resolve it. It is exactly the §5.7 {@link capFile} shape: ONE
 * capability, two delivery modes — runtime delegation (a task param, authorized by
 * the caller) vs a durable reference (authorized per-viewer by {@link resolveContentRef}).
 * `relPath` is BACKEND-NATURAL, so the reference resolves to the SAME path for every
 * viewer. Cross-app/cross-project references default to `ro`.
 *
 *   const ref = makeContentRef({ mountId: 'space:ACME', relPath: 'office-seating/desk.mdx' }, { mode: 'ro' });
 */
export const makeContentRef = (
  ref: { mountId: string; relPath: string },
  opts: { mode: 'ro' | 'rw' },
): FileCap => ({ $cap: 'file', mountId: ref.mountId, relPath: ref.relPath, mode: opts.mode });

/**
 * Resolve a content reference your app found in content it ALREADY holds
 * (FILE_SHARING §7 / UI_AS_APPS §8.7; "plan 12 §E"). This is a RELAY, not a
 * fabrication: the host honors it ONLY when your app
 * already holds a grant to `ref.mountId` (else `forbidden`) — apps follow
 * writer-authored links inside granted content; they cannot name a space from
 * nothing (T27). The host runs a per-VIEWER consent prompt (named via the owning
 * app's project sidecar), and existence is never leaked — a decline and a
 * non-existent path are indistinguishable.
 *
 * On allow, the host APPENDS a read scope for the referenced path to your grant
 * (durable; same §8.15 lifecycle) and returns the STABLE absolute `path` the file
 * is mounted at — identical for every viewer, so a path the author stored resolves
 * the same for you. Read it through the `fs` module at that path. Rejects with a
 * {@link SpaceError}: `forbidden` (you don't hold the referenced mount) or
 * `cancelled` (the viewer declined / the path doesn't exist — no oracle).
 *
 *   const { path } = await resolveContentRef(ref);
 *   const text = await fs.promises.readFile(path, 'utf8');
 */
export const resolveContentRef = async (ref: FileCap): Promise<{ path: string }> => {
  const path = await request<string>('resolveRef', { ref });
  return { path };
};

/**
 * Resolve a BATCH of content references in ONE consent round (FILE_SHARING §7 /
 * UI_AS_APPS §8.7; "plan 12 §E"). When a
 * board opens with several embedded references, pass them all here: the host
 * coalesces them into a SINGLE consent prompt listing every target, instead of one
 * prompt per reference. Same relay gate and per-viewer semantics as
 * {@link resolveContentRef} (each ref's mount must already be held), applied to the
 * whole set — it is all-or-nothing: the user allows the batch or declines it.
 *
 * Resolves `{ paths }` with the STABLE absolute path of each ref, in input order.
 * Rejects with a {@link SpaceError}: `forbidden` (a referenced mount isn't held) or
 * `cancelled` (the viewer declined).
 *
 *   const { paths } = await resolveContentRefs(board.references);
 */
export const resolveContentRefs = async (refs: FileCap[]): Promise<{ paths: string[] }> => {
  const paths = await request<string[]>('resolveRefs', { refs });
  return { paths };
};

// ---------------------------------------------------------------------------
// Settings — the per-user "~/.config"-style space (UI_AS_APPS_SPEC §3.3/§3.5/§8.2).
// Each app gets its OWN settings subdir, auto-provisioned and chroot'd by the host
// (no dialog, no powerbox). Read/write it through the returned mount's filesystem
// port — there is deliberately no key/value get/set API; settings are just files.
// ---------------------------------------------------------------------------

// Issue a `protocol-settings` request, unwrapping {ok,data} and throwing a typed
// SpaceError on failure (mirrors `request` for the spaces surface).
const settingsRequest = async <T = unknown>(
  method: string,
  query: Record<string, unknown> = {},
): Promise<T> => {
  const res = (await protocolRequest('settings', method, [query])) as SpaceResult;
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? 'settings request failed') as SpaceError;
    err.code = (res?.code as SpaceError['code']) ?? 'unknown';
    throw err;
  }
  return res.data as T;
};

/**
 * Mount this app's per-user settings — a private `~/.config`-style filesystem,
 * auto-provisioned for the signed-in user and isolated to THIS app (the host
 * chroots it; a different app can never name it). Read/write config files through
 * the returned mount. Rejects with a {@link SpaceError} (`auth-required`) when
 * signed out. Capability: baseline `settings:app`.
 */
export const openSettings = async (): Promise<SandboxMount> => {
  const mount = await settingsRequest<SandboxMount>('open');
  return waitForMount({ id: mount.id ?? mount.path });
};

/**
 * One-time SEED of this app's settings from the parent it declares as `forkOf`
 * (its `package.json` `immediately.run.forkOf`) — so a fork inherits your
 * preferences from the original app (UI_AS_APPS_SPEC §3.4). The host asks the user
 * to confirm (a full consent when the apps have different owners, a light confirm
 * when the same owner publishes both) and copies the parent's settings into this
 * app's own subdir, skipping any file you already have. Non-throwing: resolves
 * `{ ok:false, code }` on decline (`cancelled`), no declared parent (`forbidden`),
 * or signed-out (`auth-required`). After `{ ok:true }`, read {@link openSettings}.
 * Capability: baseline `settings:fork`.
 */
export const importSettingsFromParent = async (): Promise<
  { ok: true; copied: number } | { ok: false; code: string }
> => {
  try {
    const data = await settingsRequest<{ copied: number }>('importFromParent');
    return { ok: true, copied: data.copied };
  } catch (e) {
    return { ok: false, code: (e as SpaceError).code ?? 'unknown' };
  }
};

/**
 * Mount ANOTHER app's per-user settings by its `appKey` — the elevated "file
 * commander" surface. Rejects `forbidden` unless this app holds the first-party-
 * only `settings:all` capability. Most apps want {@link openSettings} instead.
 */
export const openSettingsOf = async (appKey: string): Promise<SandboxMount> => {
  const mount = await settingsRequest<SandboxMount>('openOf', { appKey });
  return waitForMount({ id: mount.id ?? mount.path });
};

/**
 * List every app that has per-user settings — the elevated "file commander"
 * enumeration. Pair with {@link openSettingsOf} to mount any of them. Rejects
 * `forbidden` unless this app holds the first-party-only `settings:all`.
 */
export const listSettingsApps = (): Promise<string[]> =>
  settingsRequest<string[]>('list');

/** Create a brand-new, empty platform-hosted space. The app reaches it (or any
 *  other space) afterward through the {@link requestMount} powerbox or
 *  {@link mountSpace}; there is no implicit per-app binding. */
export const createSpace = (
  opts: { name?: string } = {}
): Promise<SandboxMount> => requestMountInternal('create', opts);

/** List spaces you can access — all of them, or just those bound to this app. */
export const listSpaces = (opts: { app?: boolean } = {}): Promise<SpaceInfo[]> =>
  request<SpaceInfo[]>('list', opts);

/** Release a mounted space (stops its listener on the host). */
export const unmountSpace = async (query: { spaceId: string }): Promise<void> => {
  await request('unmount', query);
};

// ---------------------------------------------------------------------------
// Space management (the space-manager app) — UI_AS_APPS_SPEC §5.2. These are
// ELEVATED: enumerating all the user's spaces is `spaces:user`; mutating
// membership (share/unshare/setRole) and resolving handles is `spaces:admin`.
// The host enforces the owner-lockout invariant (a space always keeps an owner,
// T41) and rate-limits handle lookups (L1); the OAuth/identity token never
// crosses to the app.
// ---------------------------------------------------------------------------

/** A collaborator's role on a shared space: full `owner`, read-write `writer`, or read-only `reader`. */
export type Role = 'owner' | 'writer' | 'reader';

/** A member of a space (for the share/manage UI). */
export interface Member {
  /**
   * The **grantee** — `user:{uid}` | `group:{gid}`. This is the canonical name
   * (core_concepts §4: "principal" is reserved for the authority context; a space
   * member is a *grantee*). The host populates this on every member row.
   */
  grantee: string;
  /**
   * @deprecated Use {@link Member.grantee}. Kept as an alias (same value) for
   * back-compat during the `principal`→`grantee` migration; will be removed in a
   * future major. The host still populates both.
   */
  principal: string;
  role: Role;
  login?: string;
  avatarUrl?: string;
}

/** A handle resolved to a principal (handle → who). */
export interface ResolvedUser {
  uid: string;
  login: string;
  avatarUrl?: string;
}

/** A pending invitation to a space (pull-based sharing, FILE_SHARING_SPEC §6.4).
 *  It grants NO access until accepted — the recipient accepts it from their inbox
 *  ({@link listMyInvites} → {@link acceptInvite}), materializing membership. The
 *  display fields (`name`/`login`/`avatarUrl`) are untrusted for rendering. */
export interface Invite {
  spaceId: string;
  /** The invitee's uid — carried so the owner's pending list can
   *  {@link revokeInvite}(spaceId, uid). */
  uid: string;
  role: Role;
  owner: string;
  name?: string;
  invitedBy: string;
  /** epoch ms (server-stamped); absent until the write settles. */
  invitedAt?: number;
  login?: string;
  avatarUrl?: string;
}

/** Enumerate ALL the user's spaces (not just this app's) — `spaces:user`. */
export const listAllSpaces = (): Promise<SpaceInfo[]> => request<SpaceInfo[]>('listAll', {});

/** Read a space's members one-shot — `spaces:admin`. */
export const getSpaceMembers = (spaceId: string): Promise<Member[]> =>
  request<Member[]>('members', { spaceId });

/** Invite a user (by provider handle) to a space at a role — `spaces:admin`. The
 *  host resolves the handle, so the app never sees other users' uids except the one
 *  it invited. Pull-based (FILE_SHARING_SPEC §6.4): this writes an INVITATION, not
 *  membership — the recipient must {@link acceptInvite}. Re-inviting an already-
 *  invited/member user is idempotent. */
export const inviteToSpace = async (spaceId: string, login: string, role: Role): Promise<void> => {
  await request('invite', { spaceId, login, role });
};

/** The owner's outstanding invitations for a space — `spaces:admin`. */
export const listPendingInvites = (spaceId: string): Promise<Invite[]> =>
  request<Invite[]>('pendingInvites', { spaceId });

/** Withdraw a pending invitation (distinct from {@link unshareSpace}, which removes
 *  an ACCEPTED member) — `spaces:admin`. */
export const revokeInvite = async (spaceId: string, uid: string): Promise<void> => {
  await request('revokeInvite', { spaceId, uid });
};

/** The caller's OWN invitation inbox — `spaces:user`. */
export const listMyInvites = (): Promise<Invite[]> => request<Invite[]>('listInvites', {});

/** Accept an invitation: materialize your membership at the invited role and clear
 *  the invite — `spaces:user`. An invitation the caller doesn't hold rejects with
 *  `forbidden` (indistinguishable from a nonexistent space; no existence oracle). */
export const acceptInvite = async (spaceId: string): Promise<void> => {
  await request('acceptInvite', { spaceId });
};

/** Decline (dismiss) an invitation from your inbox; writes no membership —
 *  `spaces:user`. */
export const declineInvite = async (spaceId: string): Promise<void> => {
  await request('declineInvite', { spaceId });
};

// The live invitations inbox (FILE_SHARING §6.4/§9.8): the host pushes the caller's
// current invitations on change and replays on register-frame; gated `spaces:user`.
// So an invite that arrives (or an accepted/declined one leaving) reflects within one
// snapshot — no poll. Mirrors the host's `invitations`/`request-invitations` wiring.
const invitesChannel = createPushChannel<Invite[]>({
  pushType: 'invitations',
  requestType: 'request-invitations',
  initial: [],
  parse: (msg) => (Array.isArray(msg.invites) ? (msg.invites as Invite[]) : undefined),
});

/** The caller's current invitations (`spaces:user`). One-off read; use
 *  {@link onInvitesChange}/{@link useInvites} to react live. */
export const getInvites = (): Invite[] => invitesChannel.get();

/** Subscribe to invitation-inbox changes (arrived / accepted / declined). Invoked
 *  immediately with the current list, then on every change. Returns an unsubscribe. */
export const onInvitesChange = (listener: (invites: Invite[]) => void): (() => void) =>
  invitesChannel.onChange(listener);

/** React hook returning the caller's live invitation inbox, re-rendering on change
 *  (the space-manager Invitations inbox, §9.8). */
export const useInvites = (): Invite[] => invitesChannel.use();

/** Remove a member from a space — `spaces:admin`. Refused if it would orphan the
 *  space (owner-lockout, T41). */
export const unshareSpace = async (spaceId: string, uid: string): Promise<void> => {
  await request('unshare', { spaceId, uid });
};

/** Change a member's role — `spaces:admin`. Refused if it would drop the sole
 *  owner (owner-lockout, T41). */
export const setSpaceRole = async (spaceId: string, uid: string, role: Role): Promise<void> => {
  await request('setRole', { spaceId, uid, role });
};

/** Resolve a provider handle to a principal (for the invite flow) — `spaces:admin`,
 *  rate-limited host-side. */
export const lookupUser = (login: string): Promise<ResolvedUser> =>
  request<ResolvedUser>('lookupUser', { login });

/** One durable grant an app holds, for the §8.11 capability audit view. */
export interface GrantRecord {
  /** The app's provider-qualified identity (`provider__namespace__repository`). */
  appKey: string;
  spaceId: string;
  /** Universal mount id (§3.5). */
  mountId: string;
  subtree?: string;
  mode: 'ro' | 'rw';
  name?: string;
}

/** Enumerate every (app, mount) grant the user holds — the audit view
 *  (§8.11). Elevated `spaces:admin`. */
export const listGrants = (): Promise<GrantRecord[]> => request<GrantRecord[]>('grants', {});

/** Revoke one app's grant on a space — durable (the app can't re-mount) plus a
 *  best-effort live teardown. Elevated `spaces:admin`. */
export const revokeGrant = async (appKey: string, spaceId: string): Promise<void> => {
  await request('revokeGrant', { appKey, spaceId });
};
