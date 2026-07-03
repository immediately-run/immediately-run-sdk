// R3-95 (PRINCIPALS_SPEC §9 B2) — the first-party "Session" lens push channel,
// driven through the REAL public API (`getSessionMounts`/`onSessionMountsChange`)
// against the mock host. The channel is a `createPushChannel` gated host-side by the
// first-party-only `mounts:registry`: a non-first-party frame never receives the
// push, so `initial: []` stands (fail-closed) — the Session lens is absent.
//
// `jest.resetModules()` per test gives a fresh lazy channel singleton (a fresh
// `request-session-mounts` poll); the mock host survives the reset on `globalThis`.

import { createMockHost, type MockHost } from '../src/testing';

type MountsModule = typeof import('../src/mounts');
const load = (): MountsModule => {
  jest.resetModules();
  return require('../src/mounts') as MountsModule;
};

describe('useSessionMounts channel (first-party Session lens)', () => {
  let host: MockHost;
  beforeEach(() => {
    host = createMockHost();
    host.install();
  });
  afterEach(() => host.uninstall());

  it('defaults to [] and polls request-session-mounts once on first read (fail-closed)', () => {
    const { getSessionMounts, onSessionMountsChange } = load();
    const seen: number[] = [];
    onSessionMountsChange((m) => seen.push(m.length));

    expect(getSessionMounts()).toEqual([]);
    // Immediate replay with the empty initial (a non-first-party frame stays here).
    expect(seen).toEqual([0]);
    expect(host.sent.filter((s) => s.type === 'request-session-mounts')).toHaveLength(1);
  });

  it('adopts a pushed session list and reports forwardedToApp per item', () => {
    const { getSessionMounts, onSessionMountsChange } = load();
    const seen: Array<Array<[string | undefined, boolean]>> = [];
    onSessionMountsChange((m) => seen.push(m.map((x) => [x.id, x.forwardedToApp])));

    host.emit({
      type: 'session-mounts',
      mounts: [
        { id: 'space:notes', path: '/spaces/notes', type: 'space', mode: 'ro', name: 'Shared notes', forwardedToApp: false },
        { id: 'mnt/abc', path: '/mnt/abc', type: 'worktree', mode: 'rw', name: 'acme/app', forwardedToApp: true },
      ],
    });

    expect(getSessionMounts().map((m) => m.id)).toEqual(['space:notes', 'mnt/abc']);
    expect(seen[seen.length - 1]).toEqual([
      ['space:notes', false],
      ['mnt/abc', true],
    ]);
  });

  it('re-projects on a subsequent push (forwarding flips forwardedToApp live)', () => {
    const { getSessionMounts } = load();
    getSessionMounts(); // trigger the lazy channel subscription before pushing
    host.emit({ type: 'session-mounts', mounts: [{ id: 'space:notes', path: '/spaces/notes', type: 'space', forwardedToApp: false }] });
    expect(getSessionMounts()[0].forwardedToApp).toBe(false);
    host.emit({ type: 'session-mounts', mounts: [{ id: 'space:notes', path: '/spaces/notes', type: 'space', forwardedToApp: true }] });
    expect(getSessionMounts()[0].forwardedToApp).toBe(true);
  });

  it('ignores a malformed push (no mounts array) — the last good value stands', () => {
    const { getSessionMounts } = load();
    getSessionMounts(); // trigger the lazy channel subscription before pushing
    host.emit({ type: 'session-mounts', mounts: [{ id: 'a', path: '/spaces/a', type: 'space', forwardedToApp: false }] });
    host.emit({ type: 'session-mounts' }); // malformed — parse returns undefined
    expect(getSessionMounts().map((m) => m.id)).toEqual(['a']);
  });
});
