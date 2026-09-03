import { Role } from './generated/spaces.js';
export { GrantRecord, Member, ResolvedUser, SpaceInfo, getSpaceMembers, inviteToSpace, listAllSpaces, listGrants, listSpaces, lookupUser, revokeGrant, setSpaceRole, unshareSpace } from './generated/spaces.js';
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
    mode?: 'ro' | 'rw';
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
type MountRemoveReason = 'revoked' | 'unshared' | 'signed-out' | 'unmounted' | 'deleted';
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
 *
 * `timeoutMs` (optional, additive) rejects with a `timeout`-coded error instead of
 * waiting forever. Omit it to keep the original unbounded behaviour — but prefer
 * setting it on any path whose caller would otherwise hang silently: a mount that
 * never arrives is indistinguishable from one that is merely slow, and an awaited
 * promise that never settles surfaces to the user as a feature that quietly does
 * nothing.
 *
 * **Hazard — `onMountsChange` calls its listener SYNCHRONOUSLY on subscribe** (the
 * documented initial replay). So when the mount is already present — the common
 * case, since callers typically `await` the host request that creates it first —
 * the callback below runs *during* the `onMountsChange(...)` call, before the
 * assignment to `unsubscribe` completes. `unsubscribe` is therefore declared with
 * `let` ABOVE the subscription and read only inside a deferred closure: writing
 * `const unsubscribe = onMountsChange(...)` and referencing it in the callback
 * throws `ReferenceError: Cannot access 'unsubscribe' before initialization` (a
 * temporal-dead-zone read) on exactly that path. That bug silently broke
 * `openSettings()` — and with it the agent's conversation memory.
 */
declare const waitForMount: (query: MountQuery, timeoutMs?: number) => Promise<SandboxMount>;
/** The framework-free core of {@link waitForMount}, with the subscription injected
 *  so a test can drive the synchronous-initial-replay case that broke it. */
declare const awaitMatchingMount: (subscribe: (listener: (mounts: SandboxMount[]) => void) => () => void, query: MountQuery, timeoutMs?: number) => Promise<SandboxMount>;
/** React hook returning the mounts currently available, re-rendering on change. */
declare const useMounts: () => SandboxMount[];
/** A mount as seen through the first-party **Session** lens (PRINCIPALS_SPEC §9 B2):
 *  the session's mounts BEYOND this app's own (the editor/agent session's). This is
 *  a metadata view — no filesystem port — so it extends {@link SandboxMount} with only
 *  {@link forwardedToApp}. */
interface SessionMount extends SandboxMount {
    /** True iff this mount is ALSO in the app's own {@link useMounts} (the App lens);
     *  `false` for a session-export-only mount visible only to the editor/agent + the
     *  Session lens. */
    forwardedToApp: boolean;
}
/** The session's mounts (the "Session" lens superset), or `[]` when this frame is
 *  not first-party. One-off read; use {@link onSessionMountsChange}/{@link useSessionMounts}
 *  to react live. First-party only (`mounts:registry`) — a fork always sees `[]`. */
declare const getSessionMounts: () => SessionMount[];
/** Subscribe to Session-lens mount changes. Invoked immediately with the current
 *  list (`[]` for a non-first-party frame), then on every change. Returns an
 *  unsubscribe. */
declare const onSessionMountsChange: (listener: (mounts: SessionMount[]) => void) => (() => void);
/** React hook returning the live "Session" lens mount list, re-rendering on change.
 *  Empty for any non-first-party frame (the host withholds the channel), so a URL-
 *  loaded File Explorer fork renders no Session lens. */
declare const useSessionMounts: () => SessionMount[];
/** An error from a space operation, carrying a machine-readable `code`. */
interface SpaceError extends Error {
    code: 'auth-required' | 'cancelled' | 'forbidden' | 'not-found' | 'unsupported-scheme' | 'timeout' | 'unknown';
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
/** Prompt the user to grant a mount, returning the granted {@link SandboxMount}.
 *  @deprecated renamed to {@link requestMount} (backend-general, §3.5). */
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
 *
 * The body repeats {@link capFile} rather than calling it, and that is deliberate:
 * `tasks.ts` registers a host listener at module load, so a VALUE import of it here
 * would run that side effect in every importer of `mounts` (which is why the
 * `FileCap` import above is type-only). The shape the two share is the spec's, and
 * the `FileCap` type is what holds them to it.
 */
declare const makeContentRef: (ref: {
    mountId: string;
    relPath: string;
}, opts: {
    mode: "ro" | "rw";
}) => FileCap;
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
declare const resolveContentRef: (ref: FileCap) => Promise<{
    path: string;
}>;
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
declare const resolveContentRefs: (refs: FileCap[]) => Promise<{
    paths: string[];
}>;
/**
 * Mount this app's per-user settings — a private `~/.config`-style filesystem,
 * auto-provisioned for the signed-in user and isolated to THIS app (the host
 * chroots it; a different app can never name it). Read/write config files through
 * the returned mount. Rejects with a {@link SpaceError} (`auth-required`) when
 * signed out. Capability: baseline `settings:app`.
 *
 * **Which filesystem you get, and when that can change** (R3-413): for an
 * ordinary app — including one holding space grants, powerbox-picked or
 * declared — this is ALWAYS the app-level store (same mount id every call, so
 * "which space did I pick" style state survives later grants; no need to open
 * early and keep the handle). The one exception: an instance the host has
 * **floored** below its app tier (the generic-viewer containment,
 * `TRUST_MODES_SPEC` §5) gets a per-origin partition instead — a DIFFERENT
 * filesystem, chosen by the host, that changes when the loaded origin changes
 * and refuses (`forbidden`) when the floor forbids the write. If your app can
 * run floored and needs continuity across origins, keep state per-mount (the
 * returned `SandboxMount.id` tells you which partition you are in).
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
/** Create a brand-new, empty platform-hosted space, granted to THIS app in full
 *  (read-write) — the user's create consent is consent for the app to create
 *  storage for itself, and the host records the same durable grant the
 *  {@link requestMount} powerbox would. So the returned mount can be re-opened
 *  later with {@link mountSpace} / {@link mount} (`space:<id>`) with no prompt —
 *  on the next load, in another tab, after sign-out/sign-in — until the user
 *  revokes the grant in their grants surface, after which `mount` answers
 *  `forbidden`. Other apps get nothing: they still reach the space only through
 *  the powerbox. (Before site-main R3-406 no grant was recorded and the space
 *  could only be re-found via the powerbox.) */
declare const createSpace: (opts?: {
    name?: string;
}) => Promise<SandboxMount>;
/** Release a mounted space (stops its listener on the host). */
declare const unmountSpace: (query: {
    spaceId: string;
}) => Promise<void>;
/** A pending invitation to a space (pull-based sharing, FILE_SHARING_SPEC §6.4).
 *  It grants NO access until accepted — the recipient accepts it from their inbox
 *  ({@link listMyInvites} → {@link acceptInvite}), materializing membership. The
 *  display fields (`name`/`login`/`avatarUrl`) are untrusted for rendering. */
interface Invite {
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
/** The owner's outstanding invitations for a space — `spaces:admin`. */
declare const listPendingInvites: (spaceId: string) => Promise<Invite[]>;
/** Withdraw a pending invitation (distinct from {@link unshareSpace}, which removes
 *  an ACCEPTED member) — `spaces:admin`. */
declare const revokeInvite: (spaceId: string, uid: string) => Promise<void>;
/** The caller's OWN invitation inbox — `spaces:user`. */
declare const listMyInvites: () => Promise<Invite[]>;
/** Accept an invitation: materialize your membership at the invited role and clear
 *  the invite — `spaces:user`. An invitation the caller doesn't hold rejects with
 *  `forbidden` (indistinguishable from a nonexistent space; no existence oracle). */
declare const acceptInvite: (spaceId: string) => Promise<void>;
/** Decline (dismiss) an invitation from your inbox; writes no membership —
 *  `spaces:user`. */
declare const declineInvite: (spaceId: string) => Promise<void>;
/** The caller's current invitations (`spaces:user`). One-off read; use
 *  {@link onInvitesChange}/{@link useInvites} to react live. */
declare const getInvites: () => Invite[];
/** Subscribe to invitation-inbox changes (arrived / accepted / declined). Invoked
 *  immediately with the current list, then on every change. Returns an unsubscribe. */
declare const onInvitesChange: (listener: (invites: Invite[]) => void) => (() => void);
/** React hook returning the caller's live invitation inbox, re-rendering on change
 *  (the space-manager Invitations inbox, §9.8). */
declare const useInvites: () => Invite[];

export { type Invite, type MountQuery, type MountRemoveReason, type MountRule, type RemovedMount, Role, type SandboxMount, type SessionMount, type SpaceError, acceptInvite, awaitMatchingMount, createSpace, declineInvite, findMount, getAppMountPath, getInvites, getMounts, getSessionMounts, importSettingsFromParent, listMyInvites, listPendingInvites, listSettingsApps, makeContentRef, mount, mountSpace, onInvitesChange, onMountsChange, onSessionMountsChange, openSettings, openSettingsOf, requestMount, requestSpace, resolveContentRef, resolveContentRefs, revokeInvite, unmountSpace, useInvites, useMounts, useSessionMounts, waitForMount };
