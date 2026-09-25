// R3-708 — the spaces mode's route channel and its navigation verb.
//
// The push payload below is typed as `{ state: SpacesModeState }`, and the navigate targets
// are cross-checked against the GENERATED params interface. Neither is a bare literal, and
// the difference matters: `SpacesModeState` is the type `npm run protocol:check` extracts
// from this module and compares against the wire descriptor's `value`. So a descriptor
// change fails that gate unless `SpacesModeState` moves with it — and when it moves, this
// fixture stops compiling. The fixture is bound to the contract THROUGH the gate rather
// than directly, which is the strongest coupling available here.
//
// Why no generated interface is used for either half: an sdk-side push declares
// `payload.reads` and a `value` (never `payload.fields`), so no `SpacesModePayload` is
// emitted — the shape R3-562 round 3 established. And `navigate`'s payload is a UNION (the
// two arms of `SpacesTarget`), which likewise emits no `…NavigateParams` interface. In both
// cases the binding to the descriptor runs through `protocol:check`, which extracts these
// very types from this module and compares them to the wire.
//
// Why not sandbox-protocol's `src/fixtures.ts`, which the item asked for: that module's own
// test asserts it covers EXACTLY the three names R3-274e resolved and that every fixture is
// "spoken by BOTH sides — that is what makes it cross-side". `spaces-mode` is SDK-only (the
// frame relays it; the host is the other end), so putting it there would break two
// deliberate invariants to satisfy a third.
import { SPACES_MODE, REQUEST_SPACES_MODE } from './generated/protocol';
import type { SpacesModeState } from './spacesMode';

type Listener = (msg: Record<string, unknown>) => void;
const listeners: Record<string, Listener[]> = {};
const sendMessage = jest.fn();
const protocolRequest = jest.fn();

jest.mock('./hostTransport', () => ({
  sendMessage: (...args: unknown[]) => sendMessage(...args),
  addListener: (type: string, h: Listener) => {
    (listeners[type] ||= []).push(h);
    return () => {
      listeners[type] = (listeners[type] || []).filter((x) => x !== h);
    };
  },
}));

jest.mock('./sandboxUtils', () => ({
  protocolRequest: (...args: unknown[]) => protocolRequest(...args),
}));

type Mod = typeof import('./spacesMode');
let mod: Mod;

const push = (msg: Record<string, unknown>) => (listeners[SPACES_MODE] || []).forEach((l) => l(msg));

/** The object site-main's `SandboxListener` will send. */
const PAYLOAD: { state: SpacesModeState } = {
  state: {
    route: { spaceId: 'sp_1', activity: 'spaces', path: 'notes/today.mdx' },
    space: { id: 'sp_1', name: 'Team notes', role: 'writer', kind: 'shared', root: '/mnt/sp_1' },
  },
};
// Values are deliberately distinguishable — no two fields share a value — so a parser that
// drops, reorders or conflates one produces a visibly different result rather than an
// accidentally-equal one.
const payload = (over: Partial<Record<string, unknown>> = {}): Record<string, unknown> =>
  JSON.parse(JSON.stringify({ ...PAYLOAD, ...over })) as Record<string, unknown>;

beforeEach(() => {
  jest.resetModules();
  for (const k of Object.keys(listeners)) delete listeners[k];
  sendMessage.mockReset();
  protocolRequest.mockReset();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  mod = require('./spacesMode');
});

// ── the read half ────────────────────────────────────────────────────────────

it('is null before the host says anything — not a synthetic launcher route', () => {
  // The whole compatibility story. A standalone tab, `vite dev`, an older host and a frame
  // the host does not push to all land here. Defaulting to `{ activity: 'spaces' }` would
  // make "no host" indistinguishable from "the host says you are on the launcher", and an
  // app could not tell when to fall back to its own UI.
  expect(mod.getSpacesMode()).toBeNull();
});

it('polls the host on first read, so a late-mounting app still gets the route', () => {
  mod.getSpacesMode();
  expect(sendMessage).toHaveBeenCalledWith(REQUEST_SPACES_MODE);
});

it('a well-formed push becomes the state', () => {
  mod.getSpacesMode();
  push(payload());
  expect(mod.getSpacesMode()).toEqual({
    route: { spaceId: 'sp_1', activity: 'spaces', path: 'notes/today.mdx' },
    space: { id: 'sp_1', name: 'Team notes', role: 'writer', kind: 'shared', root: '/mnt/sp_1' },
  });
});

it('carries every optional tail field the activities use', () => {
  mod.getSpacesMode();
  push(
    payload({
      state: {
        route: { spaceId: 'sp_2', activity: 'people', member: 'uid_9', section: 'sharing', roomId: 'room_3' },
        space: null,
      },
    }),
  );
  expect(mod.getSpacesMode()).toEqual({
    route: { spaceId: 'sp_2', activity: 'people', member: 'uid_9', section: 'sharing', roomId: 'room_3' },
    space: null,
  });
});

it('spaceId null + activity inbox is the CROSS-SPACE inbox — the second null-space route', () => {
  // `/spaces/-/inbox`. Round 1 ruled that `spaceId: null` is two routes, not one, and the
  // ruling landed in the JSDoc while this combination stayed the one neither suite sent —
  // every `inbox` case paired with a string id, every null id with `activity: 'spaces'`.
  // The host's reserved `-` is URL grammar and must never appear as an id here.
  mod.getSpacesMode();
  push(payload({ state: { route: { spaceId: null, activity: 'inbox' }, space: null } }));
  expect(mod.getSpacesMode()).toEqual({ route: { spaceId: null, activity: 'inbox' }, space: null });
});

it('a null space is a VALUE — the launcher with no space selected', () => {
  mod.getSpacesMode();
  push(payload({ state: { route: { spaceId: null, activity: 'spaces' }, space: null } }));
  expect(mod.getSpacesMode()).toEqual({ route: { spaceId: null, activity: 'spaces' }, space: null });
});

it('a pushed null RETRACTS the state — the host can say "this frame has left the mode"', () => {
  // The wire declares the channel's value `SpacesModeState | null`, so `null` is a legal
  // message and must SET the value, not be ignored as malformed. Folding it into the
  // "not an object" guard left the last route standing forever, and an app would keep
  // rendering a space it is no longer in.
  mod.getSpacesMode();
  push(payload());
  expect(mod.getSpacesMode()).not.toBeNull();
  push({ state: null });
  expect(mod.getSpacesMode()).toBeNull();
});

describe('a malformed push is IGNORED, leaving the last good value standing', () => {
  // Never throw in the listener and never adopt a value nobody sent: every frame in the
  // mode reads this channel, so a bad push must not move any of them.
  const cases: Array<[string, Record<string, unknown>]> = [
    ['an unknown activity', { state: { route: { spaceId: 'x', activity: 'bogus' }, space: null } }],
    ['a non-string spaceId', { state: { route: { spaceId: 7, activity: 'spaces' }, space: null } }],
    ['a missing route', { state: { space: null } }],
    [
      'a non-string optional tail field',
      { state: { route: { spaceId: 'x', activity: 'spaces', path: 3 }, space: null } },
    ],
    [
      'a space.root that is neither string nor null',
      {
        state: {
          route: { spaceId: 'x', activity: 'spaces' },
          space: { id: 'x', name: 'n', role: 'owner', kind: 'shared', root: 5 },
        },
      },
    ],
    [
      'an unknown role',
      {
        state: {
          route: { spaceId: 'x', activity: 'spaces' },
          space: { id: 'x', name: 'n', role: 'admin', kind: 'shared', root: null },
        },
      },
    ],
    [
      'an unknown kind',
      {
        state: {
          route: { spaceId: 'x', activity: 'spaces' },
          space: { id: 'x', name: 'n', role: 'owner', kind: 'team', root: null },
        },
      },
    ],
    ['no state at all', {}],
    ['a state that is not an object', { state: 'nope' }],
    // These pin a real property — an array-shaped payload is ignored — but they do NOT
    // distinguish `isRecord`'s `!Array.isArray` branch, and round 1's suggested fix does
    // not either. Measured: deleting that clause leaves all 58 tests green. It cannot be
    // otherwise. `typeof [] === 'object'`, so an array that got past the guard would go on
    // to read `.activity`/`.route` off it, find `undefined`, and be ignored for that
    // reason instead — same outcome, no observable difference, for every array a JSON
    // payload can carry. The clause stays because it makes the PREDICATE honest (a caller
    // reading `isRecord(v)` as "v is a record" would be misled by `true` for `[]`), not
    // because any input depends on it. Recorded rather than claimed closed.
    ['a state that is an ARRAY', { state: [] }],
    ['a route that is an ARRAY', { state: { route: [], space: null } }],
  ];
  it.each(cases)('%s', (_label, bad) => {
    mod.getSpacesMode();
    push(payload());
    const good = mod.getSpacesMode();
    expect(() => push(bad)).not.toThrow();
    expect(mod.getSpacesMode()).toEqual(good);
  });
});

it('the parsed route is copied field by field, not spread from the wire', () => {
  // A host that adds a field tomorrow must not have it appear on an object apps treat as
  // this version's shape — an app would read it, and the SDK would have promised nothing.
  mod.getSpacesMode();
  push(payload({ state: { route: { spaceId: 'sp_1', activity: 'inbox', futureField: 'x' }, space: null } }));
  expect(mod.getSpacesMode()?.route).toEqual({ spaceId: 'sp_1', activity: 'inbox' });
});

it('each subscriber gets one call per push, and unsubscribing one leaves the other', () => {
  const a = jest.fn();
  const b = jest.fn();
  const offA = mod.onSpacesModeChange(a);
  mod.onSpacesModeChange(b);
  // onChange fires immediately with the current value.
  expect(a).toHaveBeenCalledTimes(1);
  expect(b).toHaveBeenCalledTimes(1);

  push(payload());
  expect(a).toHaveBeenCalledTimes(2);
  expect(b).toHaveBeenCalledTimes(2);

  offA();
  push(payload({ state: { route: { spaceId: 'sp_3', activity: 'settings' }, space: null } }));
  expect(a).toHaveBeenCalledTimes(2);
  expect(b).toHaveBeenCalledTimes(3);
});

// ── the write half ───────────────────────────────────────────────────────────

it('navigateSpaces resolves when the host accepts', async () => {
  protocolRequest.mockResolvedValue({ ok: true });
  await expect(mod.navigateSpaces({ spaceId: 'sp_1', activity: 'spaces' })).resolves.toBeUndefined();
});

it('sends exactly [target] — a route with member and section', async () => {
  protocolRequest.mockResolvedValue({ ok: true });
  const target = { spaceId: 'sp_1', activity: 'people' as const, member: 'uid_9', section: 'sharing' };
  await mod.navigateSpaces(target);
  expect(protocolRequest).toHaveBeenCalledWith('spaces-mode', 'navigate', [target]);
});

it('sends exactly [target] — the one host destination outside the mode', async () => {
  protocolRequest.mockResolvedValue({ ok: true });
  await mod.navigateSpaces({ destination: 'notifications' });
  expect(protocolRequest).toHaveBeenCalledWith('spaces-mode', 'navigate', [{ destination: 'notifications' }]);
});

it('a coded refusal REJECTS, carrying the code', async () => {
  // The refusal resolves inside the reply, so `ok !== true` is the only failure test there
  // is — treating the resolved promise as success would swallow every refusal.
  protocolRequest.mockResolvedValue({ ok: false, code: 'forbidden', message: 'not a member' });
  await expect(mod.navigateSpaces({ spaceId: 'sp_x', activity: 'spaces' })).rejects.toMatchObject({
    code: 'forbidden',
    message: 'not a member',
  });
});

it('a refusal with no code is `unknown`, not a success', async () => {
  protocolRequest.mockResolvedValue({ ok: false });
  await expect(mod.navigateSpaces({ spaceId: 'sp_x', activity: 'spaces' })).rejects.toMatchObject({
    code: 'unknown',
  });
});

it('an empty reply is a refusal, not a success', async () => {
  protocolRequest.mockResolvedValue(undefined);
  await expect(mod.navigateSpaces({ spaceId: 'sp_x', activity: 'spaces' })).rejects.toMatchObject({
    code: 'unknown',
  });
});

describe('the reply is the DISPATCHER ENVELOPE, and only a thrown refusal reaches us', () => {
  // These inputs are the frames site-main's `requestDispatcher` actually emits, not shapes
  // chosen to match the code. It builds exactly two (`SpaceResult`):
  //
  //   handler THROWS spaceError(code, msg) -> result: { ok: false, code, message }
  //   handler RETURNS value                -> result: { ok: true,  data: value }
  //
  // and the sandbox resolves `msg.result` unmodified. So a handler that RETURNS
  // `{ ok:false, code }` — which `handleOpenRepository` does today — produces an envelope
  // saying the call SUCCEEDED, with the refusal buried in `data` where nothing looks.

  const thrown = { ok: false, code: 'forbidden', message: 'not a member' };
  const returned = { ok: true, data: { ok: false, code: 'forbidden' } };

  it('a THROWN refusal rejects with the code — the shape R3-707 must produce', async () => {
    protocolRequest.mockResolvedValue(thrown);
    await expect(mod.navigateSpaces({ spaceId: 'sp_x', activity: 'spaces' })).rejects.toMatchObject({
      code: 'forbidden',
      message: 'not a member',
    });
  });

  it('a RETURNED refusal resolves — pinning the trap so R3-707 cannot ship into it', async () => {
    // This asserts what the SDK DOES, and it is not what anyone wants: the envelope says
    // ok, so the app believes it navigated. The fix belongs on the host side (throw), and
    // the SDK deliberately does NOT sniff `data.ok` — doing so would bless a second reply
    // contract where the spec names one. If this test ever starts failing because the SDK
    // learned to see through the envelope, delete it and say why.
    protocolRequest.mockResolvedValue(returned);
    await expect(mod.navigateSpaces({ spaceId: 'sp_x', activity: 'spaces' })).resolves.toBeUndefined();
  });

  it('a successful call carries data in the envelope and still resolves', async () => {
    protocolRequest.mockResolvedValue({ ok: true, data: undefined });
    await expect(mod.navigateSpaces({ destination: 'notifications' })).resolves.toBeUndefined();
  });
});
