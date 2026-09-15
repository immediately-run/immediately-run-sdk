// openLocalStore (FILESYSTEM_SPEC sec 2.8) over the sec-4 transport, driven through the
// REAL public API against the mock host (TESTING_AUTOMATION_SPEC sec 3) - the same
// shape test/transportMounts.spec.ts uses for the getMounts/onMountsChange path.
// jest.resetModules() per test gives a fresh lazy singleton; the mock host lives
// on globalThis and survives the reset.

import { createMockHost, type MockHost } from './testing';

type MountsModule = typeof import('./mounts');
const load = (): MountsModule => {
  jest.resetModules();
  return require('./mounts') as MountsModule;
};

describe('openLocalStore over the transport (FILESYSTEM_SPEC sec 2.8)', () => {
  let host: MockHost;
  beforeEach(() => {
    host = createMockHost();
    host.install();
  });
  afterEach(() => host.uninstall());

  it('requests protocol-localstore.open and resolves the delivered mount', async () => {
    const { openLocalStore } = load();
    host.stubProtocol('localstore', 'open', () => ({
      ok: true,
      data: { id: 'localstore:abc', path: '/local/abc', type: 'localstore' },
    }));

    const pending = openLocalStore();
    // Flush the protocol reply (a microtask) and let waitForMount subscribe to
    // the mount stream before the host announces the mount (a macrotask later).
    await new Promise((r) => setTimeout(r, 0));
    host.emit({ type: 'mount-add', mount: { id: 'localstore:abc', path: '/local/abc', type: 'localstore' } });

    expect(await pending).toMatchObject({ id: 'localstore:abc', path: '/local/abc', type: 'localstore' });
    expect(host.protocolCalls).toEqual([{ protocol: 'localstore', method: 'open', params: [{}] }]);
  });

  it('surfaces a typed failure rather than hanging (auth-required)', async () => {
    const { openLocalStore } = load();
    host.stubProtocol('localstore', 'open', () => ({
      ok: false,
      code: 'auth-required',
      message: 'signed out',
    }));

    await expect(openLocalStore()).rejects.toMatchObject({ code: 'auth-required' });
  });
});

// ---------------------------------------------------------------------------
// R3-546 (BUNDLE_EMBEDDING §4a.3, gate G-BE-19): a mount announcement may carry
// `bundle` — the federated target's kind + pruned layout. It is additive data on the
// descriptor: an announcement without it (every non-bundle mount, and every older
// host) is unchanged, and the field round-trips through the transport cache exactly
// as the host announced it.
// ---------------------------------------------------------------------------

describe('SandboxMount.bundle — federated bundle facts on the descriptor (R3-546)', () => {
  let host: MockHost;
  beforeEach(() => {
    host = createMockHost();
    host.install();
  });
  afterEach(() => host.uninstall());

  const bundleMount = {
    id: 'task-9:items',
    path: '/task/task-9/items',
    type: 'task-delegation',
    bundle: {
      kind: 'wiki',
      diagnostics: ['not-a-bundle'],
      layout: {
        version: 1,
        recordSets: { 'roadmap-items': { dir: '/roadmap', select: 'R3-*.mdx', record: 'mdx-frontmatter' } },
        tree: { '/roadmap': { purpose: 'the live engineering roadmap' } },
      },
    },
  };

  it('round-trips a bundle-carrying mount through getMounts() and onMountsChange()', async () => {
    const { getMounts, onMountsChange } = load();
    const seen: unknown[][] = [];
    const unsub = onMountsChange((mounts) => seen.push(mounts));
    await new Promise((r) => setTimeout(r, 0));
    host.emit({ type: 'mount-add', mount: bundleMount });
    await new Promise((r) => setTimeout(r, 0));

    expect(getMounts()).toEqual([bundleMount]);
    expect(seen[seen.length - 1]).toEqual([bundleMount]);
    unsub();
  });

  it('leaves a bundle-less announcement unchanged (compat: the field is additive)', async () => {
    const { getMounts } = load();
    const plain = { id: 'localstore:abc', path: '/local/abc', type: 'localstore' };
    expect(getMounts()).toEqual([]); // initializes the transport cache BEFORE the announce
    await new Promise((r) => setTimeout(r, 0));
    host.emit({ type: 'mount-add', mount: plain });
    await new Promise((r) => setTimeout(r, 0));
    expect(getMounts()).toEqual([plain]);
    expect('bundle' in getMounts()[0]).toBe(false);
  });
});
