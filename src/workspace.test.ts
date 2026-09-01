// R3-491 — the baseline `workspace` channel (UI_AS_APPS_SPEC §5.15).
//
// Three properties are worth proving here and nowhere else.
//
// 1. **`null` is a VALUE, not a parse failure.** This channel's whole point is that a
//    frame can be in no editing session at all, and that a frame can LEAVE one. A
//    parse that treated `null` as "unreadable message" would keep the last known
//    project standing forever — an app scoping durable data by it would then write
//    into the wrong project's scope after a navigation.
// 2. **The parse is a whitelist.** The channel is baseline-readable by every app, so
//    "it discloses only the session's coordinates" must be a property of the code,
//    not of the host's good manners.
// 3. **A silent host leaves `null` standing.** An app on an older host degrades to
//    unscoped, never to wrongly-scoped.
type Listener = (msg: Record<string, unknown>) => void;
const listeners: Record<string, Listener[]> = {};
const sendMessage = jest.fn();

jest.mock('./hostTransport', () => ({
  sendMessage: (...args: unknown[]) => sendMessage(...args),
  addListener: (type: string, h: Listener) => {
    (listeners[type] ||= []).push(h);
    return () => {
      listeners[type] = (listeners[type] || []).filter((x) => x !== h);
    };
  },
}));

import type { Workspace } from './workspace';

type Mod = typeof import('./workspace');
let mod: Mod;
const push = (msg: Record<string, unknown>) => (listeners['workspace'] || []).forEach((l) => l(msg));

const RECIPES: Workspace = {
  provider: 'github',
  namespace: 'neumark-family',
  repository: 'recipes',
  ref: 'main',
  label: 'neumark-family/recipes',
};
const LOCAL: Workspace = {
  provider: 'local',
  namespace: 'my-app-3fa9c2d1',
  repository: 'my-app',
  ref: 'live',
  label: 'my-app-3fa9c2d1/my-app',
};

beforeEach(() => {
  jest.resetModules();
  for (const k of Object.keys(listeners)) delete listeners[k];
  sendMessage.mockReset();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  mod = require('./workspace');
});

it('defaults to `null` on a host that never pushes — unscoped, never wrongly scoped', () => {
  expect(mod.getWorkspace()).toBeNull();
});

it('polls for a snapshot on first read — the leg a SELF-ROUTED panel depends on', () => {
  // A session's project does not change mid-session, so a panel that mounts after
  // the only push has no future change to wait for. Without this poll it would read
  // `null` forever.
  mod.getWorkspace();
  expect(sendMessage).toHaveBeenCalledWith('request-workspace');
});

it('replays the current value then fires on every change', () => {
  const seen: (Workspace | null)[] = [];
  const off = mod.onWorkspaceChange((w) => seen.push(w));
  expect(seen).toEqual([null]); // immediate replay
  push({ workspace: RECIPES });
  expect(seen[1]).toEqual(RECIPES);
  off();
  push({ workspace: LOCAL });
  expect(seen).toHaveLength(2); // unsubscribed
});

it('a later read sees the pushed value', () => {
  mod.getWorkspace();
  push({ workspace: RECIPES });
  expect(mod.getWorkspace()).toEqual(RECIPES);
});

it('a `local` session is carried verbatim — `namespace` is NOT always a GitHub owner', () => {
  mod.getWorkspace();
  push({ workspace: LOCAL });
  expect(mod.getWorkspace()).toEqual(LOCAL);
  expect(mod.getWorkspace()!.provider).toBe('local');
});

it('an explicit `null` LANDS — leaving a session must not keep the old project', () => {
  // The distinction the parse exists to make. If `null` were treated like an
  // unreadable message, a frame that navigated out of a session would keep reporting
  // the project it used to be in, and an app scoping durable data by `label` would
  // write into the wrong project's scope.
  mod.getWorkspace();
  push({ workspace: RECIPES });
  expect(mod.getWorkspace()).toEqual(RECIPES);
  push({ workspace: null });
  expect(mod.getWorkspace()).toBeNull();
});

describe('the validator rejects anything that is not a Workspace', () => {
  it.each([
    ['no payload at all', {}],
    ['a string', { workspace: 'neumark-family/recipes' }],
    ['a number', { workspace: 7 }],
    ['an array', { workspace: [] }],
    ['a missing label', { workspace: { provider: 'github', namespace: 'n', repository: 'r', ref: 'main' } }],
    ['a missing provider', { workspace: { namespace: 'n', repository: 'r', ref: 'main', label: 'n/r' } }],
    ['a missing ref', { workspace: { provider: 'github', namespace: 'n', repository: 'r', label: 'n/r' } }],
    [
      'a non-string field',
      { workspace: { provider: 'github', namespace: 'n', repository: 'r', ref: 2, label: 'n/r' } },
    ],
  ])('ignores %s and keeps the last good value', (_label, msg) => {
    mod.getWorkspace();
    push({ workspace: RECIPES });
    push(msg as Record<string, unknown>);
    expect(mod.getWorkspace()).toEqual(RECIPES);
  });

  it('a garbage FIRST message leaves the default standing, it does not corrupt it', () => {
    mod.getWorkspace();
    push({ workspace: 'nonsense' });
    expect(mod.getWorkspace()).toBeNull();
  });

  it('does not copy host-supplied extras into app-visible memory', () => {
    // Baseline-readable by every app: a host that pushes a token or a user id
    // alongside the coordinates must not get it across this seam.
    mod.getWorkspace();
    push({
      workspace: { ...RECIPES, sessionToken: 'sekrit', user: { id: 'u1' } },
    });
    expect(Object.keys(mod.getWorkspace()!).sort()).toEqual(['label', 'namespace', 'provider', 'ref', 'repository']);
  });
});
