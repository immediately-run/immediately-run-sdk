// PROTOTYPE — the single-source capability descriptors for the `spaces:*` family.
//
// This is the §2 `CapabilityDescriptor` set from
// `docs/specs/SDK_SIMPLIFICATION_SPEC.md`, transcribed by hand from the THREE
// surfaces it would replace as authoritative:
//   - the runtime catalog names (`src/catalog.ts` `invoke('spaces:invite', …)`)
//   - the hand-written typed wrappers (`src/mounts.ts` inviteToSpace/unshareSpace/…)
//   - the capability + error vocabulary (`docs/specs/CAPABILITY_REFERENCE.md`)
//
// In the real design this set is generated from the host gate table; here it is
// authored so the generator (generate.mjs) has something to project from. Every
// field is the ONE place a fact about `spaces:invite` lives — change `params` here
// and the wrapper, its types, the catalog schema, and llms.txt all move together.

/** Shared named types (emitted once, referenced by `$ref`). These are the
 *  json-schema form of the interfaces hand-declared in `src/mounts.ts`. */
export const types = {
  Role: {
    description:
      "A collaborator's role on a shared space: full `owner`, read-write `writer`, or read-only `reader`.",
    schema: { type: 'string', enum: ['owner', 'writer', 'reader'] },
  },
  SpaceInfo: {
    description: 'Summary of a space, as returned by {@link listSpaces}.',
    schema: {
      type: 'object',
      required: ['spaceId'],
      properties: {
        spaceId: { type: 'string' },
        role: { $ref: 'Role' },
        owner: { type: 'string' },
        name: { type: 'string' },
      },
    },
  },
  Member: {
    description: 'A member of a space (for the share/manage UI).',
    schema: {
      type: 'object',
      required: ['grantee', 'principal', 'role'],
      properties: {
        grantee: {
          type: 'string',
          description:
            'The **grantee** — `user:{uid}` | `group:{gid}`. This is the canonical name ' +
            '(core_concepts §4: "principal" is reserved for the authority context; a space ' +
            'member is a *grantee*). The host populates this on every member row.',
        },
        // Modelled because the descriptors must describe what SHIPS: omitting this
        // would make the generated `Member` drop a public field — a breaking change
        // `api:check` cannot see (it compares exported NAMES, and the interface keeps
        // its name). The `description` below is the SHIPPED prose, verbatim; this
        // rationale is for whoever edits the descriptor, not for the public doc.
        principal: {
          type: 'string',
          description:
            '@deprecated Use {@link Member.grantee}. Kept as an alias (same value) for ' +
            'back-compat during the `principal`→`grantee` migration; will be removed in a ' +
            'future major. The host still populates both.',
        },
        role: { $ref: 'Role' },
        login: { type: 'string' },
        avatarUrl: { type: 'string' },
      },
    },
  },
  ResolvedUser: {
    description: 'A handle resolved to a principal (handle → who).',
    schema: {
      type: 'object',
      required: ['uid', 'login'],
      properties: {
        uid: { type: 'string' },
        login: { type: 'string' },
        avatarUrl: { type: 'string' },
      },
    },
  },
  GrantRecord: {
    description: "One durable grant an app holds, for the §8.11 capability audit view.",
    schema: {
      type: 'object',
      required: ['appKey', 'spaceId', 'mountId', 'mode'],
      properties: {
        appKey: {
          type: 'string',
          description:
            "The app's provider-qualified **program** identity (AA-01 `appKey`). The DEFAULT " +
            'program keys to the bare `provider__namespace__repository`; a NAMED mini-app ' +
            'appends a fourth `enc()`-escaped component (`provider__namespace__repository__name`) ' +
            "so its grants isolate from the repo's other programs. Host-supplied — the app " +
            'never builds this key.',
        },
        spaceId: { type: 'string' },
        mountId: { type: 'string', description: 'Universal mount id (§3.5).' },
        subtree: { type: 'string' },
        mode: { type: 'string', enum: ['ro', 'rw'] },
        name: { type: 'string' },
      },
    },
  },
};

/** The error-code registry slice the `spaces:*` family can reply
 *  (CAPABILITY_REFERENCE error-code registry; SpaceError in src/mounts.ts). */
const SPACE_ERRORS = [
  'auth-required',
  'cancelled',
  'forbidden',
  'not-found',
  'unsupported-scheme',
  'unknown',
];

/** The capability descriptors. `name` is the catalog name `invoke()` already takes;
 *  `alias` carries the curated human wrapper (positional form preserved for
 *  byte-compatible migration, §3.2 / §7). */
export const methods = [
  {
    name: 'spaces:list',
    capability: 'spaces:app',
    kind: 'request',
    doc: 'List spaces you can access — all of them, or just those bound to this app.',
    params: {
      type: 'object',
      properties: { app: { type: 'boolean', description: 'Only spaces bound to this app.' } },
    },
    result: { type: 'array', items: { $ref: 'SpaceInfo' } },
    errors: SPACE_ERRORS,
    alias: { fn: 'listSpaces', positional: ['opts'] },
  },
  {
    name: 'spaces:listAll',
    capability: 'spaces:user',
    kind: 'request',
    doc: "Enumerate ALL the user's spaces (not just this app's).",
    params: { type: 'object', properties: {} },
    result: { type: 'array', items: { $ref: 'SpaceInfo' } },
    errors: SPACE_ERRORS,
    alias: { fn: 'listAllSpaces', positional: [] },
  },
  {
    name: 'spaces:members',
    capability: 'spaces:admin',
    kind: 'request',
    doc: "Read a space's members one-shot.",
    params: {
      type: 'object',
      required: ['spaceId'],
      properties: { spaceId: { type: 'string' } },
    },
    result: { type: 'array', items: { $ref: 'Member' } },
    errors: SPACE_ERRORS,
    alias: { fn: 'getSpaceMembers', positional: ['spaceId'] },
  },
  {
    // Was transcribed as `spaces:share` → `shareSpace` — a method the SDK has never
    // exported (R3-166, corrected 2026-08-08 once `verify.mjs` started comparing
    // against the shipped surface). The real one is `spaces:invite` →
    // `inviteToSpace`, and the difference is the MODEL, not the spelling: under the
    // §6.4 pull-based flow an invite is an OFFER, so this writes an invite doc and
    // membership — and therefore the space's trust tier — materialises only if the
    // invitee accepts. Do not "simplify" the name back to share.
    name: 'spaces:invite',
    capability: 'spaces:admin',
    kind: 'request',
    doc:
      'Invite a user (by provider handle) to a space at a role. The host resolves the ' +
      'handle, so the app never sees other users\' uids except the one it invited. ' +
      'Pull-based (FILE_SHARING_SPEC §6.4): this writes an INVITATION, not membership — ' +
      'the recipient must {@link acceptInvite}. Re-inviting an already-invited/member ' +
      'user is idempotent.',
    params: {
      type: 'object',
      required: ['spaceId', 'login', 'role'],
      properties: {
        spaceId: { type: 'string' },
        login: { type: 'string' },
        role: { $ref: 'Role' },
      },
    },
    result: { type: 'void' },
    errors: SPACE_ERRORS,
    alias: { fn: 'inviteToSpace', positional: ['spaceId', 'login', 'role'] },
  },
  {
    name: 'spaces:unshare',
    capability: 'spaces:admin',
    kind: 'request',
    doc: 'Remove a member from a space. Refused if it would orphan the space (owner-lockout, T41).',
    params: {
      type: 'object',
      required: ['spaceId', 'uid'],
      properties: { spaceId: { type: 'string' }, uid: { type: 'string' } },
    },
    result: { type: 'void' },
    errors: [...SPACE_ERRORS, 'conflict'],
    alias: { fn: 'unshareSpace', positional: ['spaceId', 'uid'] },
  },
  {
    name: 'spaces:setRole',
    capability: 'spaces:admin',
    kind: 'request',
    doc: "Change a member's role. Refused if it would drop the sole owner (owner-lockout, T41).",
    params: {
      type: 'object',
      required: ['spaceId', 'uid', 'role'],
      properties: {
        spaceId: { type: 'string' },
        uid: { type: 'string' },
        role: { $ref: 'Role' },
      },
    },
    result: { type: 'void' },
    errors: [...SPACE_ERRORS, 'conflict'],
    alias: { fn: 'setSpaceRole', positional: ['spaceId', 'uid', 'role'] },
  },
  {
    name: 'spaces:lookupUser',
    capability: 'spaces:admin',
    kind: 'request',
    doc: 'Resolve a provider handle to a principal (for the invite flow). Rate-limited host-side.',
    params: {
      type: 'object',
      required: ['login'],
      properties: { login: { type: 'string' } },
    },
    result: { $ref: 'ResolvedUser' },
    errors: SPACE_ERRORS,
    alias: { fn: 'lookupUser', positional: ['login'] },
  },
  {
    name: 'spaces:grants',
    capability: 'spaces:admin',
    kind: 'request',
    doc: 'Enumerate every (app, mount) grant the user holds — the audit view (§8.11). Elevated.',
    params: { type: 'object', properties: {} },
    result: { type: 'array', items: { $ref: 'GrantRecord' } },
    errors: SPACE_ERRORS,
    alias: { fn: 'listGrants', positional: [] },
  },
  {
    name: 'spaces:revokeGrant',
    capability: 'spaces:admin',
    kind: 'request',
    doc:
      "Revoke one app's grant on a space — durable (the app can't re-mount) plus a " +
      'best-effort live teardown. Elevated.',
    params: {
      type: 'object',
      required: ['appKey', 'spaceId'],
      properties: { appKey: { type: 'string' }, spaceId: { type: 'string' } },
    },
    result: { type: 'void' },
    errors: SPACE_ERRORS,
    alias: { fn: 'revokeGrant', positional: ['appKey', 'spaceId'] },
  },
];

export const family = {
  scheme: 'spaces',
  doc:
    'Space management (the space-manager app) — UI_AS_APPS_SPEC §5.2. ELEVATED: ' +
    'enumerating all the user\'s spaces is `spaces:user`; mutating membership and ' +
    'resolving handles is `spaces:admin`.',
  types,
  methods,
};
