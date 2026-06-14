// R3-51b — mounts descriptor channel over the §4 transport (the npm-fetched
// fallback for the injected `bundler.mounts`). Driven through the REAL public API
// (`getMounts`/`onMountsChange`) against the mock host (TESTING_AUTOMATION_SPEC §3):
// with no injection present (jest), `mountService()` resolves the transport cache,
// which we feed by emitting the host's `mount-add`/`mount-remove` messages.
//
// `jest.resetModules()` per test gives a fresh lazy singleton (and thus a fresh
// `request-mounts` + cache); the mock host lives on `globalThis`, so it survives the
// module reset and the freshly-loaded module subscribes to it.

import { createMockHost, type MockHost } from '../src/testing';

type MountsModule = typeof import('../src/mounts');
const load = (): MountsModule => {
  jest.resetModules();
  return require('../src/mounts') as MountsModule;
};

describe('mounts over the transport (npm-fetched fallback)', () => {
  let host: MockHost;
  beforeEach(() => {
    host = createMockHost();
    host.install();
  });
  afterEach(() => host.uninstall());

  it('sends request-mounts once, replays the current set to a new subscriber', () => {
    const { onMountsChange } = load();
    const seen: Array<{ ids: (string | undefined)[]; removed: number }> = [];
    onMountsChange((m, r) => seen.push({ ids: m.map((x) => x.id), removed: r.length }));

    // Immediate replay with the (empty) current list and no removals.
    expect(seen).toEqual([{ ids: [], removed: 0 }]);
    // The host is asked to replay the current mounts exactly once.
    expect(host.sent.filter((s) => s.type === 'request-mounts')).toHaveLength(1);
  });

  it('builds the cache from mount-add and notifies (add)', () => {
    const { getMounts, onMountsChange } = load();
    const seen: (string | undefined)[][] = [];
    onMountsChange((m) => seen.push(m.map((x) => x.id)));

    host.emit({ type: 'mount-add', mount: { path: '/spaces/a', type: 'firestore', id: 'a' } });
    host.emit({ type: 'mount-add', mount: { path: '/spaces/b', type: 'firestore', id: 'b' } });

    expect(getMounts().map((x) => x.id)).toEqual(['a', 'b']);
    expect(seen).toEqual([[], ['a'], ['a', 'b']]);
  });

  it('ignores the transferred port — only the descriptor is mirrored', () => {
    const { getMounts } = load();
    getMounts(); // first read establishes the lazy subscription before mounts stream in
    const { port1 } = new MessageChannel();
    host.emit({
      type: 'mount-add',
      mount: { path: '/spaces/a', type: 'firestore', id: 'a', mode: 'rw' },
      ports: [port1], // attached by the iframe layer; the SDK must not need it
    });
    expect(getMounts()).toEqual([{ path: '/spaces/a', type: 'firestore', id: 'a', mode: 'rw' }]);
  });

  it('replaces by key on a role downgrade (same id, mode: ro)', () => {
    const { getMounts, onMountsChange } = load();
    const modes: (string | undefined)[] = [];
    onMountsChange((m) => modes.push(m.find((x) => x.id === 'a')?.mode));

    host.emit({ type: 'mount-add', mount: { path: '/spaces/a', type: 'firestore', id: 'a', mode: 'rw' } });
    host.emit({ type: 'mount-add', mount: { path: '/spaces/a', type: 'firestore', id: 'a', mode: 'ro' } });

    expect(getMounts()).toHaveLength(1); // replaced, not duplicated
    expect(getMounts()[0].mode).toBe('ro');
    expect(modes).toEqual([undefined, 'rw', 'ro']);
  });

  it('mount-remove drops by key and surfaces the reason', () => {
    const { getMounts, onMountsChange } = load();
    const removals: string[] = [];
    onMountsChange((_m, r) => r.forEach((x) => removals.push(`${x.id}:${x.reason}`)));

    host.emit({ type: 'mount-add', mount: { path: '/spaces/a', type: 'firestore', id: 'a' } });
    host.emit({ type: 'mount-remove', id: 'a', reason: 'unshared' });

    expect(getMounts()).toEqual([]);
    expect(removals).toEqual(['a:unshared']);
  });

  it('normalizes an absent/unknown remove reason to revoked', () => {
    const { onMountsChange } = load();
    const reasons: string[] = [];
    onMountsChange((_m, r) => r.forEach((x) => reasons.push(x.reason)));

    host.emit({ type: 'mount-add', mount: { path: '/spaces/a', type: 'firestore', id: 'a' } });
    host.emit({ type: 'mount-remove', id: 'a' }); // no reason
    host.emit({ type: 'mount-add', mount: { path: '/spaces/b', type: 'firestore', id: 'b' } });
    host.emit({ type: 'mount-remove', id: 'b', reason: 'bogus' }); // unknown

    expect(reasons).toEqual(['revoked', 'revoked']);
  });

  it('waitForMount resolves once the matching mount-add arrives', async () => {
    const { waitForMount } = load();
    const pending = waitForMount({ type: 'firestore' });
    host.emit({ type: 'mount-add', mount: { path: '/spaces/a', type: 'firestore', id: 'a' } });
    await expect(pending).resolves.toMatchObject({ id: 'a', type: 'firestore' });
  });
});
