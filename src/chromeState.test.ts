// R3-191 — the optional `chrome-state` channel (PRESENT_MODE_CHROME_SPEC §6).
//
// Two properties are worth proving here and nowhere else.
//
// 1. **A host that never pushes it is indistinguishable from one that does** (R-PMC-18).
//    This channel is the one thing in the present-mode ladder that apps MAY consume, and
//    the spec forbids any platform behavior from depending on it. So the default has to be
//    the "nothing is over you" state, and it has to stand forever on a silent host — an app
//    that gates a pause on this simply never pauses, rather than pausing forever.
//
// 2. **The parse is a whitelist.** The channel is baseline-readable by every app, so
//    "it discloses only whether platform chrome is over you" must be a property of the
//    code, not of the host's good manners: a host that pushes a token, a capability or a
//    user id alongside the state must not get it into app-visible memory.
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

import type { ChromeState } from './chromeState';

type Mod = typeof import('./chromeState');
let mod: Mod;
const push = (msg: Record<string, unknown>) => (listeners['chrome-state'] || []).forEach((l) => l(msg));

const OPEN: ChromeState = { overlay: 'menu', tab: { edge: 'top-right' } };
const CLOSED: ChromeState = { overlay: 'none', tab: { edge: 'top-right' } };

beforeEach(() => {
  jest.resetModules();
  for (const k of Object.keys(listeners)) delete listeners[k];
  sendMessage.mockReset();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  mod = require('./chromeState');
});

it('R-PMC-18: defaults to "nothing is over you" on a host that never pushes', () => {
  expect(mod.getChromeState()).toEqual(CLOSED);
});

it('polls for a snapshot on first read, so a late-mounting app is not left guessing', () => {
  mod.getChromeState();
  expect(sendMessage).toHaveBeenCalledWith('request-chrome-state');
});

it('replays the current value then fires on every change', () => {
  const seen: ChromeState[] = [];
  const off = mod.onChromeStateChange((c) => seen.push(c));
  expect(seen).toEqual([CLOSED]); // immediate replay
  push({ chromeState: OPEN });
  expect(seen[1]).toEqual(OPEN);
  push({ chromeState: CLOSED });
  expect(seen[2]).toEqual(CLOSED);
  off();
  push({ chromeState: OPEN });
  expect(seen).toHaveLength(3); // unsubscribed
});

it('a later read sees the pushed value', () => {
  mod.getChromeState();
  push({ chromeState: OPEN });
  expect(mod.getChromeState()).toEqual(OPEN);
});

describe('the validator rejects anything that is not a ChromeState', () => {
  it.each([
    ['no payload at all', {}],
    ['null', { chromeState: null }],
    ['a string', { chromeState: 'menu' }],
    ['an unknown overlay value', { chromeState: { overlay: 'sheet', tab: { edge: 'top-right' } } }],
    ['a missing tab', { chromeState: { overlay: 'menu' } }],
    ['an unknown tab edge', { chromeState: { overlay: 'menu', tab: { edge: 'bottom-left' } } }],
    ['a tab that is not an object', { chromeState: { overlay: 'menu', tab: 'top-right' } }],
  ])('ignores %s and keeps the last good value', (_label, msg) => {
    mod.getChromeState();
    push({ chromeState: OPEN });
    push(msg as Record<string, unknown>);
    expect(mod.getChromeState()).toEqual(OPEN);
  });

  it('a garbage FIRST message leaves the default standing, it does not corrupt it', () => {
    const seen: ChromeState[] = [];
    mod.onChromeStateChange((c) => seen.push(c));
    push({ chromeState: { overlay: 'whatever' } });
    expect(seen).toEqual([CLOSED]); // no second call
    expect(mod.getChromeState()).toEqual(CLOSED);
  });
});

it('the parse is a WHITELIST — extra host-supplied fields never reach app memory', () => {
  // A host that pushed a token/capability/user id alongside the state must not get it
  // into the value apps read. The channel is baseline-readable by every app, so this is
  // a property of the code, not of the host's good manners.
  mod.getChromeState();
  push({
    chromeState: OPEN,
    token: 'ghp_secret',
    capability: 'spaces:admin',
    user: { login: 'someone' },
  });
  expect(mod.getChromeState()).toEqual(OPEN);
  expect(Object.keys(mod.getChromeState())).toEqual(['overlay', 'tab']);
});

it('is host->app only — reading never sends anything but the poll', () => {
  // There is no `chrome:set`: an app observes platform chrome, it cannot operate it.
  // The only message this module may ever send is its own snapshot request.
  mod.onChromeStateChange(() => undefined);
  push({ chromeState: OPEN });
  expect(sendMessage.mock.calls.map((c) => c[0])).toEqual(['request-chrome-state']);
});
