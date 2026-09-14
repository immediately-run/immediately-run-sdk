/** A collaborator's role on a shared space: full `owner`, read-write `writer`, or read-only `reader`. */
type Role = 'owner' | 'writer' | 'reader';
/** Summary of a space, as returned by {@link listSpaces}. */
interface SpaceInfo {
    spaceId: string;
    role?: Role;
    owner?: string;
    name?: string;
}
/** A member of a space (for the share/manage UI). */
interface Member {
    /** The **grantee** — `user:{uid}` | `group:{gid}`. This is the canonical name (core_concepts §4: "principal" is reserved for the authority context; a space member is a *grantee*). The host populates this on every member row. */
    grantee: string;
    /** @deprecated Use {@link Member.grantee}. Kept as an alias (same value) for back-compat during the `principal`→`grantee` migration; will be removed in a future major. The host still populates both. */
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
/** One durable grant an app holds, for the §8.11 capability audit view. */
interface GrantRecord {
    /** The app's provider-qualified **program** identity (AA-01 `appKey`). The DEFAULT program keys to the bare `provider__namespace__repository`; a NAMED mini-app appends a fourth `enc()`-escaped component (`provider__namespace__repository__name`) so its grants isolate from the repo's other programs. Host-supplied — the app never builds this key. */
    appKey: string;
    spaceId: string;
    /** Universal mount id (§3.5). */
    mountId: string;
    subtree?: string;
    mode: 'ro' | 'rw';
    name?: string;
}
type ListSpacesError = 'auth-required' | 'cancelled' | 'forbidden' | 'not-found' | 'unsupported-scheme' | 'unknown';
/**
 * List spaces you can access — all of them, or just those bound to this app.
 *
 * Capability: `spaces:app`. Catalog name: `spaces:list`.
 * @throws `Error & { code: ListSpacesError }` on host refusal.
 */
declare const listSpaces: (opts?: {
    app?: boolean;
}) => Promise<SpaceInfo[]>;
type ListAllSpacesError = 'auth-required' | 'cancelled' | 'forbidden' | 'not-found' | 'unsupported-scheme' | 'unknown';
/**
 * Enumerate ALL the user's spaces (not just this app's).
 *
 * Capability: `spaces:user`. Catalog name: `spaces:listAll`.
 * @throws `Error & { code: ListAllSpacesError }` on host refusal.
 */
declare const listAllSpaces: () => Promise<SpaceInfo[]>;
type GetSpaceMembersError = 'auth-required' | 'cancelled' | 'forbidden' | 'not-found' | 'unsupported-scheme' | 'unknown';
/**
 * Read a space's members one-shot.
 *
 * Capability: `spaces:admin`. Catalog name: `spaces:members`.
 * @throws `Error & { code: GetSpaceMembersError }` on host refusal.
 */
declare const getSpaceMembers: (spaceId: string) => Promise<Member[]>;
type InviteToSpaceError = 'auth-required' | 'cancelled' | 'forbidden' | 'not-found' | 'unsupported-scheme' | 'unknown';
/**
 * Invite a user (by provider handle) to a space at a role. The host resolves
 * the handle, so the app never sees other users' uids except the one it
 * invited. Pull-based (FILE_SHARING_SPEC §6.4): this writes an INVITATION,
 * not membership — the recipient must {@link acceptInvite}. Re-inviting an
 * already-invited/member user is idempotent.
 *
 * Capability: `spaces:admin`. Catalog name: `spaces:invite`.
 * @throws `Error & { code: InviteToSpaceError }` on host refusal.
 */
declare const inviteToSpace: (spaceId: string, login: string, role: Role) => Promise<void>;
type UnshareSpaceError = 'auth-required' | 'cancelled' | 'forbidden' | 'not-found' | 'unsupported-scheme' | 'unknown' | 'conflict';
/**
 * Remove a member from a space. Refused if it would orphan the space
 * (owner-lockout, T41).
 *
 * Capability: `spaces:admin`. Catalog name: `spaces:unshare`.
 * @throws `Error & { code: UnshareSpaceError }` on host refusal.
 */
declare const unshareSpace: (spaceId: string, uid: string) => Promise<void>;
type SetSpaceRoleError = 'auth-required' | 'cancelled' | 'forbidden' | 'not-found' | 'unsupported-scheme' | 'unknown' | 'conflict';
/**
 * Change a member's role. Refused if it would drop the sole owner
 * (owner-lockout, T41).
 *
 * Capability: `spaces:admin`. Catalog name: `spaces:setRole`.
 * @throws `Error & { code: SetSpaceRoleError }` on host refusal.
 */
declare const setSpaceRole: (spaceId: string, uid: string, role: Role) => Promise<void>;
type LookupUserError = 'auth-required' | 'cancelled' | 'forbidden' | 'not-found' | 'unsupported-scheme' | 'unknown';
/**
 * Resolve a provider handle to a principal (for the invite flow).
 * Rate-limited host-side.
 *
 * Capability: `spaces:admin`. Catalog name: `spaces:lookupUser`.
 * @throws `Error & { code: LookupUserError }` on host refusal.
 */
declare const lookupUser: (login: string) => Promise<ResolvedUser>;
type ListGrantsError = 'auth-required' | 'cancelled' | 'forbidden' | 'not-found' | 'unsupported-scheme' | 'unknown';
/**
 * Enumerate every (app, mount) grant the user holds — the audit view
 * (§8.11). Elevated.
 *
 * Capability: `spaces:admin`. Catalog name: `spaces:grants`.
 * @throws `Error & { code: ListGrantsError }` on host refusal.
 */
declare const listGrants: () => Promise<GrantRecord[]>;
type RevokeGrantError = 'auth-required' | 'cancelled' | 'forbidden' | 'not-found' | 'unsupported-scheme' | 'unknown';
/**
 * Revoke one app's grant on a space — durable (the app can't re-mount) plus
 * a best-effort live teardown. Elevated.
 *
 * Capability: `spaces:admin`. Catalog name: `spaces:revokeGrant`.
 * @throws `Error & { code: RevokeGrantError }` on host refusal.
 */
declare const revokeGrant: (appKey: string, spaceId: string) => Promise<void>;

export { type GetSpaceMembersError, type GrantRecord, type InviteToSpaceError, type ListAllSpacesError, type ListGrantsError, type ListSpacesError, type LookupUserError, type Member, type ResolvedUser, type RevokeGrantError, type Role, type SetSpaceRoleError, type SpaceInfo, type UnshareSpaceError, getSpaceMembers, inviteToSpace, listAllSpaces, listGrants, listSpaces, lookupUser, revokeGrant, setSpaceRole, unshareSpace };
