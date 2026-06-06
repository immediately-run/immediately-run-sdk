/**
 * A filesystem mount available to the sandbox, mirrored from the host window.
 *
 * Mounts appear on demand — call {@link openAppSpace} / {@link mountSpace} to ask
 * the host to mount a Firestore-backed "space"; it appears at `/spaces/{id}`.
 * Read or subscribe to the set, then access the files through the `fs` module at
 * the mount's `path`.
 */
interface SandboxMount {
    /** Absolute path where the mount is reachable (e.g. `/spaces/{id}`). */
    path: string;
    /** Backend kind, e.g. `'firestore'`. */
    type: string;
    /** Optional stable identifier (the spaceId, for spaces). */
    id?: string;
}
/** A predicate-style matcher for {@link findMount} / {@link waitForMount}. */
type MountQuery = {
    type?: string;
    id?: string;
    path?: string;
};
/**
 * Returns the mounts currently available. Poll this whenever you need a one-off
 * read; use {@link onMountsChange} or {@link useMounts} to react to changes.
 */
declare const getMounts: () => SandboxMount[];
/** Returns the first mount matching `query`, or `undefined`. */
declare const findMount: (query: MountQuery) => SandboxMount | undefined;
/**
 * Subscribe to mount changes. The listener is invoked immediately with the
 * current mounts, then again on every change. Returns an unsubscribe fn.
 */
declare const onMountsChange: (listener: (mounts: SandboxMount[]) => void) => (() => void);
/**
 * Resolves once a mount matching `query` is present (immediately if it already
 * is). Handy for "use it when it appears" — e.g.
 * `await waitForMount({ type: 'firestore' })` before reading `/firestore`.
 */
declare const waitForMount: (query: MountQuery) => Promise<SandboxMount>;
/** React hook returning the mounts currently available, re-rendering on change. */
declare const useMounts: () => SandboxMount[];
/** Summary of a space, as returned by {@link listSpaces}. */
interface SpaceInfo {
    spaceId: string;
    role?: 'owner' | 'writer' | 'reader';
    owner?: string;
    name?: string;
}
/** An error from a space operation, carrying a machine-readable `code`. */
interface SpaceError extends Error {
    code: 'auth-required' | 'cancelled' | 'forbidden' | 'not-found' | 'unsupported-scheme' | 'unknown';
}
/**
 * Open this app's workspace for the signed-in user (the zero-config path). The
 * `slot` names which workspace (default `'default'`); pass distinct slots for
 * multiple filesystems in one app. On a missing slot the host shows a
 * create-or-pick dialog. Rejects with a {@link SpaceError} (`.code`) on cancel.
 */
declare const openAppSpace: (slot?: string) => Promise<SandboxMount>;
/**
 * Mount a filesystem by its **universal mount id** (UI_AS_APPS_SPEC §3.5) —
 * `scheme:locator`, e.g. `space:{spaceId}` or `github:owner/repo@ref`. Backend-blind:
 * the host resolves the scheme. A scheme with no resolver rejects with
 * {@link SpaceError} `unsupported-scheme`.
 */
declare const mount: (mountId: string) => Promise<SandboxMount>;
/** Mount a specific space by id (e.g. one shared with you, or from a link). A thin
 *  shim over {@link mount} with the `space:` scheme. */
declare const mountSpace: (query: {
    spaceId: string;
}) => Promise<SandboxMount>;
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
declare const requestMount: () => Promise<SandboxMount>;
/** @deprecated renamed to {@link requestMount} (backend-general, §3.5). */
declare const requestSpace: () => Promise<SandboxMount>;
/** Create a brand-new space, optionally binding it to this app (a slot). */
declare const createSpace: (opts?: {
    name?: string;
    slot?: string;
    bindToApp?: boolean;
}) => Promise<SandboxMount>;
/** List spaces you can access — all of them, or just those bound to this app. */
declare const listSpaces: (opts?: {
    app?: boolean;
}) => Promise<SpaceInfo[]>;
/** Release a mounted space (stops its listener on the host). */
declare const unmountSpace: (query: {
    spaceId: string;
}) => Promise<void>;
type Role = 'owner' | 'writer' | 'reader';
/** A member of a space (for the share/manage UI). */
interface Member {
    /** `user:{uid}` | `group:{gid}`. */
    principal: string;
    role: Role;
    login?: string;
    avatarUrl?: string;
}
/** A handle resolved to a principal (handle → who). */
interface ResolvedUser {
    uid: string;
    login: string;
    avatarUrl?: string;
}
/** Enumerate ALL the user's spaces (not just this app's) — `spaces:user`. */
declare const listAllSpaces: () => Promise<SpaceInfo[]>;
/** Read a space's members one-shot — `spaces:admin`. */
declare const getSpaceMembers: (spaceId: string) => Promise<Member[]>;
/** Invite a user (by provider handle) to a space at a role — `spaces:admin`. The
 *  host resolves the handle, so the app never sees other users' uids except the
 *  one it invited. */
declare const shareSpace: (spaceId: string, login: string, role: Role) => Promise<void>;
/** Remove a member from a space — `spaces:admin`. Refused if it would orphan the
 *  space (owner-lockout, T41). */
declare const unshareSpace: (spaceId: string, uid: string) => Promise<void>;
/** Change a member's role — `spaces:admin`. Refused if it would drop the sole
 *  owner (owner-lockout, T41). */
declare const setSpaceRole: (spaceId: string, uid: string, role: Role) => Promise<void>;
/** Resolve a provider handle to a principal (for the invite flow) — `spaces:admin`,
 *  rate-limited host-side. */
declare const lookupUser: (login: string) => Promise<ResolvedUser>;
/** One durable grant an app holds, for the §8.11 capability audit view. */
interface GrantRecord {
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
declare const listGrants: () => Promise<GrantRecord[]>;
/** Revoke one app's grant on a space — durable (the app can't re-mount) plus a
 *  best-effort live teardown. Elevated `spaces:admin`. */
declare const revokeGrant: (appKey: string, spaceId: string) => Promise<void>;

export { type GrantRecord, type Member, type MountQuery, type ResolvedUser, type Role, type SandboxMount, type SpaceError, type SpaceInfo, createSpace, findMount, getMounts, getSpaceMembers, listAllSpaces, listGrants, listSpaces, lookupUser, mount, mountSpace, onMountsChange, openAppSpace, requestMount, requestSpace, revokeGrant, setSpaceRole, shareSpace, unmountSpace, unshareSpace, useMounts, waitForMount };
