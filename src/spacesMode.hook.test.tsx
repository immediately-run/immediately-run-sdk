/**
 * @jest-environment jsdom
 */
// R3-708 — `useSpacesMode()` is a HOOK, and nothing in `spacesMode.test.ts` could tell.
//
// Every test there calls `getSpacesMode()`. Round 1 proved the gap by replacing
// `channel.use()` with `channel.get()` in `spacesMode.ts`: all 22 tests stayed green and
// `tsc` said nothing, because the two have the same signature. The shipped export would
// have been a non-reactive getter wearing a hook's name — an app would read the route once
// at mount and never move again, and the whole point of the channel is that a route change
// re-renders every frame.
//
// So this file renders the hook for real and asserts the RE-RENDER, which is the only
// property `get()` cannot fake. It is its own file because the environment pragma is
// per-file and `spacesMode.test.ts` is a node-environment suite.
import { SPACES_MODE } from './generated/protocol';
import type { SpacesModeState } from './spacesMode';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

jest.mock('./sandboxUtils', () => ({ protocolRequest: jest.fn() }));

type Mod = typeof import('./spacesMode');
let mod: Mod;
// `jest.resetModules()` gives `pushChannel.ts` a FRESH React, so `react-dom/client` must
// be re-required from the same registry or the renderer dispatches into a different
// React's hook state and every render throws "Invalid hook call". Statically importing
// either one is the bug, and it is invisible until a hook is actually rendered.
let act: typeof import('react').act;
let createRoot: typeof import('react-dom/client').createRoot;

const push = (msg: Record<string, unknown>) =>
  act(() => {
    (listeners[SPACES_MODE] || []).forEach((l) => l(msg));
  });

const STATE: SpacesModeState = {
  route: { spaceId: 'sp_1', activity: 'spaces', path: 'notes/today.mdx' },
  space: { id: 'sp_1', name: 'Team notes', role: 'writer', kind: 'shared', root: '/mnt/sp_1' },
};

/** Render a probe that records the hook's value on every render. */
const renderProbe = () => {
  const seen: Array<SpacesModeState | null> = [];
  const Probe = () => {
    seen.push(mod.useSpacesMode());
    return null;
  };
  const root = createRoot(document.createElement('div'));
  act(() => root.render(<Probe />));
  return { seen, unmount: () => act(() => root.unmount()) };
};

beforeEach(() => {
  jest.resetModules();
  for (const k of Object.keys(listeners)) delete listeners[k];
  sendMessage.mockReset();
  /* eslint-disable @typescript-eslint/no-var-requires */
  act = require('react').act;
  createRoot = require('react-dom/client').createRoot;
  mod = require('./spacesMode');
  /* eslint-enable @typescript-eslint/no-var-requires */
});

it('renders null before the host answers, then RE-RENDERS with the pushed route', () => {
  const { seen, unmount } = renderProbe();
  expect(seen).toEqual([null]);

  push({ state: STATE });

  // The re-render is the assertion. A getter would leave `seen` at length 1.
  expect(seen.length).toBeGreaterThan(1);
  expect(seen[seen.length - 1]).toEqual(STATE);
  unmount();
});

it('re-renders again on a SECOND push — it is a subscription, not a one-shot', () => {
  const { seen, unmount } = renderProbe();
  push({ state: STATE });
  const afterFirst = seen.length;

  push({ state: { route: { spaceId: 'sp_2', activity: 'settings', section: 'sharing' }, space: null } });

  expect(seen.length).toBeGreaterThan(afterFirst);
  expect(seen[seen.length - 1]).toEqual({
    route: { spaceId: 'sp_2', activity: 'settings', section: 'sharing' },
    space: null,
  });
  unmount();
});

it('a malformed push does NOT re-render — the ignored message is invisible to React', () => {
  const { seen, unmount } = renderProbe();
  push({ state: STATE });
  const settled = seen.length;

  push({ state: { route: { spaceId: 'x', activity: 'bogus' }, space: null } });

  expect(seen.length).toBe(settled);
  expect(seen[seen.length - 1]).toEqual(STATE);
  unmount();
});

it('a retracting null push re-renders back to null', () => {
  const { seen, unmount } = renderProbe();
  push({ state: STATE });
  const afterRoute = seen.length;
  expect(seen[seen.length - 1]).toEqual(STATE); // …and we really went somewhere first

  push({ state: null });

  // Both halves are needed. Asserting only the last value passes under a NON-reactive
  // `get()`, because the probe then renders once, with null, and never again — the test
  // would be named for reactivity while proving nothing, which is the failure this file
  // exists to catch.
  expect(seen.length).toBeGreaterThan(afterRoute);
  expect(seen[seen.length - 1]).toBeNull();
  unmount();
});

it('a push after unmount is inert — it does not throw and renders nothing', () => {
  // NOT named "unsubscribes", which is what it said in round 1 and could not observe.
  // Measured: deleting the cleanup (`useEffect(() => onChange(setValue), [])` ->
  // `useEffect(() => { onChange(setValue); }, [])` in pushChannel.ts) leaves all 5 of
  // these green. React 19 no-ops a setState on an unmounted root with no warning, and
  // `seen` only grows during render, so a LEAKED listener is invisible from out here.
  //
  // The property this file CAN hold is the one it is now named for — a push after unmount
  // is harmless — and the unsubscribe mechanism `use()` delegates to is pinned directly in
  // `src/pushChannel.test.tsx`.
  const { seen, unmount } = renderProbe();
  push({ state: STATE });
  const atUnmount = seen.length;
  unmount();

  expect(() => push({ state: { route: { spaceId: 'sp_9', activity: 'inbox' }, space: null } })).not.toThrow();
  expect(seen.length).toBe(atUnmount);
});
