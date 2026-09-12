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
