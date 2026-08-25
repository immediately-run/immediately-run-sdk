// R3-307 — the host-attention channel: what the host is waiting for, right now.
//
// Two things are worth proving here and nowhere else: that the channel is the ordinary
// get/onChange/use push channel every other host-state helper is (so a reader learns nothing
// new to use it), and — criterion 4 — that its parse is a WHITELIST, so a host that pushes
// a secret id, an app key, or a capability alongside the state cannot get it into app-visible
// memory even by accident. The channel is readable by every app at the baseline principal,
// so "it discloses only that the host is busy, and with what kind of prompt" has to be a
// property of the code, not of the host's good manners.
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

import type { HostAttention } from './hostAttention';

type Mod = typeof import('./hostAttention');
let mod: Mod;
const push = (msg: Record<string, unknown>) => (listeners['host-attention'] || []).forEach((l) => l(msg));

beforeEach(() => {
  jest.resetModules();
  for (const k of Object.keys(listeners)) delete listeners[k];
  sendMessage.mockReset();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  mod = require('./hostAttention');
});

it('assumes nobody is being asked until the host says otherwise', () => {
  // Defaulting the other way would suspend every may-prompt deadline forever on a host that
  // does not push this channel — the hang R3-298/R3-307 exist to remove.
  expect(mod.getHostAttention()).toEqual({ awaiting: false, kind: null, since: null });
});

it('polls for a snapshot on first read, so a late-mounting app is not left guessing', () => {
  mod.getHostAttention();
  expect(sendMessage).toHaveBeenCalledWith('request-host-attention');
});

it('replays the current value then fires on every change', () => {
  const seen: HostAttention[] = [];
  const off = mod.onHostAttentionChange((a) => seen.push(a));
  expect(seen).toHaveLength(1); // immediate replay
  push({ attention: { awaiting: true, kind: 'passkey', since: 1234 } });
  expect(seen[1]).toEqual({ awaiting: true, kind: 'passkey', since: 1234 });
  push({ attention: { awaiting: false, kind: null, since: null } });
  expect(seen[2]).toEqual({ awaiting: false, kind: null, since: null });
  off();
  push({ attention: { awaiting: true, kind: 'consent', since: 9 } });
  expect(seen).toHaveLength(3); // unsubscribed
});

it('carries NO secret value, secret id, app key, capability or resource — criterion 4', () => {
  // The host is not trusted to push only the declared fields: the parse REBUILDS the value
  // from the three it knows, so anything else is dropped before an app can read it. A
  // spread-through parse would have shipped every one of these.
  const seen: HostAttention[] = [];
  mod.onHostAttentionChange((a) => seen.push(a));
  push({
    attention: {
      awaiting: true,
      kind: 'consent',
      since: 7,
      // None of this may survive.
      secretId: 'sec_abc',
      value: 'sk-live-deadbeef',
      appKey: 'github/acme/notes',
      capability: 'spaces:user',
      spaceId: 'spc_private',
      grantedCapabilities: ['secrets:list'],
    },
  });
  const latest = seen[seen.length - 1];
  expect(latest).toEqual({ awaiting: true, kind: 'consent', since: 7 });
  expect(Object.keys(latest).sort()).toEqual(['awaiting', 'kind', 'since']);
  // Belt and braces: nothing anywhere in the serialized value resembles the leaked fields.
  const serialized = JSON.stringify(latest);
  for (const leak of ['sec_abc', 'sk-live', 'acme/notes', 'spaces:user', 'spc_private']) {
    expect(serialized).not.toContain(leak);
  }
});

it('admits only the four declared kinds, and treats an unknown one as an unnamed wait', () => {
  // A kind the SDK does not know must not reach app code as a string it might render or
  // switch on — but the WAIT itself is still true, and dropping it would un-suspend a
  // deadline while a person is being asked. So: keep `awaiting`, null the `kind`.
  const seen: HostAttention[] = [];
  mod.onHostAttentionChange((a) => seen.push(a));
  for (const kind of ['passkey', 'consent', 'picker', 'confirmation']) {
    push({ attention: { awaiting: true, kind, since: 1 } });
    expect(seen[seen.length - 1].kind).toBe(kind);
  }
  push({ attention: { awaiting: true, kind: 'something-new', since: 1 } });
  expect(seen[seen.length - 1]).toEqual({ awaiting: true, kind: null, since: 1 });
});

it('ignores a malformed push — the last good value stands', () => {
  mod.onHostAttentionChange(() => {});
  push({ attention: { awaiting: true, kind: 'passkey', since: 5 } });
  const good = mod.getHostAttention();
  push({ attention: 'nope' });
  push({ attention: null });
  push({ attention: { kind: 'passkey' } }); // no `awaiting` — not a state
  push({}); // no attention at all
  expect(mod.getHostAttention()).toEqual(good);
});

it('normalizes a NOT-awaiting frame, whatever else it carries', () => {
  // "Not awaiting" has exactly one shape, so a `kind`/`since` left behind by a sloppy host
  // can never be rendered as a live prompt.
  const seen: HostAttention[] = [];
  mod.onHostAttentionChange((a) => seen.push(a));
  push({ attention: { awaiting: false, kind: 'passkey', since: 999 } });
  expect(seen[seen.length - 1]).toEqual({ awaiting: false, kind: null, since: null });
});
