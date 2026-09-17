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
    description: "A collaborator's role on a shared space: full `owner`, read-write `writer`, or read-only `reader`.",
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
    description: 'One durable grant an app holds, for the §8.11 capability audit view.',
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
  Invite: {
    description:
      'A pending invitation to a space (pull-based sharing, FILE_SHARING_SPEC §6.4). It grants NO ' +
      'access until accepted — the recipient accepts it from their inbox ({@link listMyInvites} → ' +
      '{@link acceptInvite}), materializing membership. The display fields (`name`/`login`/`avatarUrl`) ' +
      'are untrusted for rendering.',
    schema: {
      type: 'object',
      required: ['spaceId', 'uid', 'role', 'owner', 'invitedBy'],
      properties: {
        spaceId: { type: 'string' },
        uid: {
          type: 'string',
          description:
            "The invitee's uid — carried so the owner's pending list can {@link revokeInvite}(spaceId, uid).",
        },
        role: { $ref: 'Role' },
        owner: { type: 'string' },
        name: { type: 'string' },
        invitedBy: { type: 'string' },
        invitedAt: { type: 'number', description: 'epoch ms (server-stamped); absent until the write settles.' },
        login: { type: 'string' },
        avatarUrl: { type: 'string' },
      },
    },
  },
};

/** The error-code registry slice the `spaces:*` family can reply
 *  (CAPABILITY_REFERENCE error-code registry; SpaceError in src/mounts.ts). */
const SPACE_ERRORS = ['auth-required', 'cancelled', 'forbidden', 'not-found', 'unsupported-scheme', 'unknown'];

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
      "handle, so the app never sees other users' uids except the one it invited. " +
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
    // quota-exceeded is the R3-89 invite anti-abuse bound (per-space outstanding
    // invitations, per-recipient rate) — the host throws it (spaceHandler) and apps
    // receive it (site-main adversarial/invites asserts it), so the union must carry
    // it. Adding a code to an exported union is R-SDKS-2's gated minor: api:check
    // re-baselines deliberately, with a changelog note.
    errors: [...SPACE_ERRORS, 'quota-exceeded'],
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
  {
    // The §6.4 invite inbox — the five verbs that were the declared "next
    // migration increment" after #85. Wire names and semantics transcribed from
    // the hand-written wrappers in src/mounts.ts and the host gate table
    // (site-main actionGate: pendingInvites/revokeInvite are spaces:admin,
    // listInvites/acceptInvite/declineInvite are spaces:user).
    name: 'spaces:pendingInvites',
    capability: 'spaces:admin',
    kind: 'request',
    doc: "The owner's outstanding invitations for a space.",
    params: {
      type: 'object',
      required: ['spaceId'],
      properties: { spaceId: { type: 'string' } },
    },
    result: { type: 'array', items: { $ref: 'Invite' } },
    errors: SPACE_ERRORS,
    alias: { fn: 'listPendingInvites', positional: ['spaceId'] },
  },
  {
    name: 'spaces:revokeInvite',
    capability: 'spaces:admin',
    kind: 'request',
    doc: 'Withdraw a pending invitation (distinct from {@link unshareSpace}, which removes an ACCEPTED member).',
    params: {
      type: 'object',
      required: ['spaceId', 'uid'],
      properties: { spaceId: { type: 'string' }, uid: { type: 'string' } },
    },
    result: { type: 'void' },
    errors: SPACE_ERRORS,
    alias: { fn: 'revokeInvite', positional: ['spaceId', 'uid'] },
  },
  {
    name: 'spaces:listInvites',
    capability: 'spaces:user',
    kind: 'request',
    doc: "The caller's OWN invitation inbox.",
    params: { type: 'object', properties: {} },
    result: { type: 'array', items: { $ref: 'Invite' } },
    errors: SPACE_ERRORS,
    alias: { fn: 'listMyInvites', positional: [] },
  },
  {
    name: 'spaces:acceptInvite',
    capability: 'spaces:user',
    kind: 'request',
    doc:
      'Accept an invitation: materialize your membership at the invited role and clear the invite. An ' +
      "invitation the caller doesn't hold rejects with `forbidden` (indistinguishable from a " +
      'nonexistent space; no existence oracle).',
    params: {
      type: 'object',
      required: ['spaceId'],
      properties: { spaceId: { type: 'string' } },
    },
    result: { type: 'void' },
    errors: SPACE_ERRORS,
    alias: { fn: 'acceptInvite', positional: ['spaceId'] },
  },
  {
    name: 'spaces:declineInvite',
    capability: 'spaces:user',
    kind: 'request',
    doc: 'Decline (dismiss) an invitation from your inbox; writes no membership.',
    params: {
      type: 'object',
      required: ['spaceId'],
      properties: { spaceId: { type: 'string' } },
    },
    result: { type: 'void' },
    errors: SPACE_ERRORS,
    alias: { fn: 'declineInvite', positional: ['spaceId'] },
  },
];

export const family = {
  scheme: 'spaces',
  doc:
    'Space management (the space-manager app) — UI_AS_APPS_SPEC §5.2. ELEVATED: ' +
    "enumerating all the user's spaces is `spaces:user`; mutating membership and " +
    'resolving handles is `spaces:admin`.',
  types,
  methods,
};
