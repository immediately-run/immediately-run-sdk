import { useEffect, useState } from 'react';
import { protocolRequest } from './sandboxUtils';
import { getHostRuntime } from './hostRuntime';

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
 * Mounts appear on demand — call {@link openAppSpace} / {@link mountSpace} to ask
 * the host to mount a Firestore-backed "space"; it appears at `/spaces/{id}`.
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
}

interface MountService {
  getMounts(): SandboxMount[];
  onChange(listener: (mounts: SandboxMount[]) => void): { dispose(): void };
}

// `module.evaluation.module.bundler` is the sandbox bundler injected into the
// evaluation context (same path the other SDK helpers reach for `messageBus`).
const mountService = (): MountService => {
  // @ts-ignore - injected by the sandbox runtime
  return module.evaluation.module.bundler.mounts;
};

/** A predicate-style matcher for {@link findMount} / {@link waitForMount}. */
export type MountQuery = { type?: string; id?: string; path?: string };

const matches = (mount: SandboxMount, query: MountQuery): boolean =>
  (query.type === undefined || mount.type === query.type) &&
  (query.id === undefined || mount.id === query.id) &&
  (query.path === undefined || mount.path === query.path);

/**
 * Returns the mounts currently available. Poll this whenever you need a one-off
 * read; use {@link onMountsChange} or {@link useMounts} to react to changes.
 */
export const getMounts = (): SandboxMount[] => mountService().getMounts();

/** Returns the first mount matching `query`, or `undefined`. */
export const findMount = (query: MountQuery): SandboxMount | undefined =>
  getMounts().find((m) => matches(m, query));

/**
 * Subscribe to mount changes. The listener is invoked immediately with the
 * current mounts, then again on every change. Returns an unsubscribe fn.
 */
export const onMountsChange = (listener: (mounts: SandboxMount[]) => void): (() => void) => {
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
 * Open this app's workspace for the signed-in user (the zero-config path). The
 * `slot` names which workspace (default `'default'`); pass distinct slots for
 * multiple filesystems in one app. On a missing slot the host shows a
 * create-or-pick dialog. Rejects with a {@link SpaceError} (`.code`) on cancel.
 */
export const openAppSpace = (slot = 'default'): Promise<SandboxMount> =>
  requestMountInternal('open', { slot });

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
 * asks; the HOST shows the user their mounts and the access choice (which mount,
 * an optional subtree, read-only vs read-write); the USER picks or declines. The
 * app never sees the list — it resolves with the single granted mount, or rejects
 * with a {@link SpaceError} (`cancelled`) if declined. The granted scope is
 * enforced host-side: the mount is chroot'd / `ro`-limited accordingly.
 *
 * Backend-general (§3.5): the picker offers whatever mounts the user has (today,
 * their spaces). Returns the granted mount by its universal id.
 */
export const requestMount = (): Promise<SandboxMount> =>
  requestMountInternal('request', {});

/** @deprecated renamed to {@link requestMount} (backend-general, §3.5). */
export const requestSpace = requestMount;

/** Create a brand-new space, optionally binding it to this app (a slot). */
export const createSpace = (
  opts: { name?: string; slot?: string; bindToApp?: boolean } = {}
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

export type Role = 'owner' | 'writer' | 'reader';

/** A member of a space (for the share/manage UI). */
export interface Member {
  /** `user:{uid}` | `group:{gid}`. */
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

/** Enumerate ALL the user's spaces (not just this app's) — `spaces:user`. */
export const listAllSpaces = (): Promise<SpaceInfo[]> => request<SpaceInfo[]>('listAll', {});

/** Read a space's members one-shot — `spaces:admin`. */
export const getSpaceMembers = (spaceId: string): Promise<Member[]> =>
  request<Member[]>('members', { spaceId });

/** Invite a user (by provider handle) to a space at a role — `spaces:admin`. The
 *  host resolves the handle, so the app never sees other users' uids except the
 *  one it invited. */
export const shareSpace = async (spaceId: string, login: string, role: Role): Promise<void> => {
  await request('share', { spaceId, login, role });
};

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
