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

// R3-708 round 3: `mounts.ts` carries THREE request helpers, and the refusal unwrap in
// each was folded onto `throwOnRefusal`. Only two were reachable from a test — the third,
// the `protocol-spaces` `request`, is used by `resolveContentRef`, `resolveContentRefs`,
// `requestMountInternal` and `unmountSpace`, and no suite sent any of them a refusal. That
// matters more than an ordinary coverage gap here: `request` ends `return res.data as T`,
// which narrows off `asserts res is { ok: true }` — a helper that stopped throwing would
// COMPILE and hand back `undefined` typed as a `SandboxMount`.
// R3-780: `mounts.ts` has THREE request helpers and this one had no refusal test at all —
// `grep -rn "stubProtocol('settings'" src/*.test.ts` was empty before this. Folding it onto
// `throwOnRefusal` without one would have repeated R3-708's mistake exactly: the file's
// suite reddens under a neutered helper, so an AGGREGATE measurement says "covered", while
// the site doing the reddening is a different helper in the same file.
describe('the protocol-settings `settingsRequest` helper surfaces a coded refusal', () => {
  let host: MockHost;
  beforeEach(() => {
    host = createMockHost();
    host.install();
  });
  afterEach(() => host.uninstall());

  it('listSettingsApps rejects with the host code rather than resolving undefined', async () => {
    const { listSettingsApps } = load();
    host.stubProtocol('settings', 'list', () => ({ ok: false, code: 'forbidden', message: 'not allowed' }));

    await expect(listSettingsApps()).rejects.toMatchObject({ code: 'forbidden', message: 'not allowed' });
  });

  it('a refusal with no code is `unknown`, never a silent success', async () => {
    const { listSettingsApps } = load();
    host.stubProtocol('settings', 'list', () => ({ ok: false }));

    await expect(listSettingsApps()).rejects.toMatchObject({ code: 'unknown' });
  });

  it('a success still unwraps the envelope to `data`', async () => {
    const { listSettingsApps } = load();
    host.stubProtocol('settings', 'list', () => ({ ok: true, data: ['app.one', 'app.two'] }));

    await expect(listSettingsApps()).resolves.toEqual(['app.one', 'app.two']);
  });
});

describe('the protocol-spaces `request` helper surfaces a coded refusal', () => {
  let host: MockHost;
  beforeEach(() => {
    host = createMockHost();
    host.install();
  });
  afterEach(() => host.uninstall());

  it('resolveContentRef rejects with the host code rather than resolving undefined', async () => {
    const { resolveContentRef, makeContentRef } = load();
    host.stubProtocol('spaces', 'resolveRef', () => ({ ok: false, code: 'forbidden', message: 'not a member' }));

    await expect(
      resolveContentRef(makeContentRef({ mountId: 'space:sp_1', relPath: 'a.md' }, { mode: 'ro' })),
    ).rejects.toMatchObject({ code: 'forbidden', message: 'not a member' });
  });

  it('unmountSpace rejects on a refusal', async () => {
    const { unmountSpace } = load();
    host.stubProtocol('spaces', 'unmount', () => ({ ok: false, code: 'forbidden' }));

    await expect(unmountSpace({ spaceId: 'sp_1' })).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('a refusal with no code is `unknown`, never a silent success', async () => {
    const { unmountSpace } = load();
    host.stubProtocol('spaces', 'unmount', () => ({ ok: false }));

    await expect(unmountSpace({ spaceId: 'sp_1' })).rejects.toMatchObject({ code: 'unknown' });
  });
});

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
