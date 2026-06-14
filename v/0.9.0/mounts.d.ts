import { FileCap } from './tasks.js';

/**
 * The absolute path where this app's own repository filesystem is mounted
 * (FILE_SHARING_SPEC §11.2). Prefer this over hardcoding `/app`: the repo is
 * dual-mounted at both `/app` (back-compat) and its canonical `/mnt/{hash}`
 * address, and this returns the canonical one the host reports. Falls back to
 * `/app` when the host hasn't reported a canonical path (older host / before the
 * report arrives) — both paths are live, so either resolves the same files.
 */
declare const getAppMountPath: () => string;
/**
 * A filesystem mount available to the sandbox, mirrored from the host window.
 *
 * Mounts appear on demand — call {@link openSettings} for this app's own settings,
 * or {@link mountSpace} / {@link requestMount} to mount a Firestore-backed "space".
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
interface MountRule {
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
type MountRemoveReason = "revoked" | "unshared" | "signed-out" | "unmounted" | "deleted";
/** A descriptor delivered as REMOVED to a mounts-change listener: the mount that
 *  went away, plus the `reason` it did. */
interface RemovedMount extends SandboxMount {
    reason: MountRemoveReason;
}
/** A predicate-style matcher for {@link findMount} / {@link waitForMount}. Any
 *  combination of coordinates; `name` matches the human-readable mount label. */
type MountQuery = {
    type?: string;
    id?: string;
    path?: string;
    name?: string;
};
/**
 * Returns the mounts currently available. Poll this whenever you need a one-off
 * read; use {@link onMountsChange} or {@link useMounts} to react to changes.
 * Each descriptor carries its `id` (the spaceId), `path` (`/mnt/{hash}`) and —
 * when the host can resolve it — a human-readable `name` (R3-69), so this doubles
 * as a queryable mount→space mapping for showing or locating a mount by name.
 */
declare const getMounts: () => SandboxMount[];
/** Returns the first mount matching `query`, or `undefined`. */
declare const findMount: (query: MountQuery) => SandboxMount | undefined;
/**
 * Subscribe to mount changes. The listener is invoked immediately with the
 * current mounts (and an empty `removed`), then again on every change. The second
 * argument carries the descriptors REMOVED by that change, each with its `reason`
 * (AM2-4) — so an app can react to *why* a mount vanished (e.g. tell the user a
 * shared space was `unshared` vs `deleted`). It is empty on adds and on the
 * initial replay. Returns an unsubscribe fn.
 */
declare const onMountsChange: (listener: (mounts: SandboxMount[], removed: RemovedMount[]) => void) => (() => void);
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
declare const requestMount: () => Promise<SandboxMount>;
/** @deprecated renamed to {@link requestMount} (backend-general, §3.5). */
declare const requestSpace: () => Promise<SandboxMount>;
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
declare const makeContentRef: (ref: {
    mountId: string;
    relPath: string;
}, opts: {
    mode: "ro" | "rw";
}) => FileCap;
/**
 * Resolve a content reference your app found in content it ALREADY holds (plan 12
 * §E). This is a RELAY, not a fabrication: the host honors it ONLY when your app
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
declare const resolveContentRef: (ref: FileCap) => Promise<{
    path: string;
}>;
/**
 * Resolve a BATCH of content references in ONE consent round (plan 12 §E). When a
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
declare const resolveContentRefs: (refs: FileCap[]) => Promise<{
    paths: string[];
}>;
/**
 * Mount this app's per-user settings — a private `~/.config`-style filesystem,
 * auto-provisioned for the signed-in user and isolated to THIS app (the host
 * chroots it; a different app can never name it). Read/write config files through
 * the returned mount. Rejects with a {@link SpaceError} (`auth-required`) when
 * signed out. Capability: baseline `settings:app`.
 */
declare const openSettings: () => Promise<SandboxMount>;
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
declare const importSettingsFromParent: () => Promise<{
    ok: true;
    copied: number;
} | {
    ok: false;
    code: string;
}>;
/**
 * Mount ANOTHER app's per-user settings by its `appKey` — the elevated "file
 * commander" surface. Rejects `forbidden` unless this app holds the first-party-
 * only `settings:all` capability. Most apps want {@link openSettings} instead.
 */
declare const openSettingsOf: (appKey: string) => Promise<SandboxMount>;
/**
 * List every app that has per-user settings — the elevated "file commander"
 * enumeration. Pair with {@link openSettingsOf} to mount any of them. Rejects
 * `forbidden` unless this app holds the first-party-only `settings:all`.
 */
declare const listSettingsApps: () => Promise<string[]>;
/** Create a brand-new, empty platform-hosted space. The app reaches it (or any
 *  other space) afterward through the {@link requestMount} powerbox or
 *  {@link mountSpace}; there is no implicit per-app binding. */
declare const createSpace: (opts?: {
    name?: string;
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

export { type GrantRecord, type Member, type MountQuery, type MountRemoveReason, type MountRule, type RemovedMount, type ResolvedUser, type Role, type SandboxMount, type SpaceError, type SpaceInfo, createSpace, findMount, getAppMountPath, getMounts, getSpaceMembers, importSettingsFromParent, listAllSpaces, listGrants, listSettingsApps, listSpaces, lookupUser, makeContentRef, mount, mountSpace, onMountsChange, openSettings, openSettingsOf, requestMount, requestSpace, resolveContentRef, resolveContentRefs, revokeGrant, setSpaceRole, shareSpace, unmountSpace, unshareSpace, useMounts, waitForMount };
