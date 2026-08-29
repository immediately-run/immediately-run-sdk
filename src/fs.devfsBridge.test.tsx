/**
 * @jest-environment jsdom
 */
// R3-421 — `useObjectUrl` (and `openFs`/`readBlob`/`readObjectUrl` under it) must
// work under `vite dev` through the @immediately-run/dev-fs bridge. Since dev-fs
// 0.5.0 the plugin publishes its local-disk fs at `globalThis.__sandpackSharedFs`
// — the SAME discovery global the sandbox publishes — so the SDK's existing
// `sandboxFs()` path resolves it with no special-casing. This suite drives that
// path against a port shaped exactly like the dev-fs one: LAZY forwarders whose
// every call first awaits the shim module load (a dynamic import in dev-fs), over
// the virtual `/app` + `/spaces/{id}` layout dev-fs serves.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useObjectUrl } from './hooks';
import { fsAvailable, openFs } from './fs';
import type { SandboxMount } from './mounts';
import { TextEncoder as NodeTextEncoder } from 'node:util';

if (typeof (globalThis as { TextEncoder?: unknown }).TextEncoder === 'undefined') {
  (globalThis as { TextEncoder?: unknown }).TextEncoder = NodeTextEncoder;
}
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const enc = new TextEncoder();

// The dev-fs 0.5.0 bridge shape: `promises.*` forwarders that resolve the shim
// asynchronously per call (dev-fs lazy-imports /__devfs/client-fs.js), then hit
// the "dev server" — here an in-memory virtual-layout file map.
const devFsBridge = (files: Record<string, string>) => {
  const shim = {
    async readFile(path: string, encoding?: string) {
      if (!(path in files)) throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
      return encoding ? files[path] : enc.encode(files[path]);
    },
  };
  const load = () => Promise.resolve(shim); // the dynamic-import stand-in
  return {
    promises: {
      readFile: (...args: [string, string?]) => load().then((s) => s.readFile(...args)),
    },
  };
};

const install = (bridge: unknown) => {
  (globalThis as { __sandpackSharedFs?: unknown }).__sandpackSharedFs = bridge;
};

const spaceMount = (id = 'ab12cd34'): SandboxMount =>
  ({ path: `/spaces/${id}`, type: 'firestore', id } as SandboxMount);

const realCreate = URL.createObjectURL;
const realRevoke = URL.revokeObjectURL;
let created: Blob[];
let revoked: string[];

beforeEach(() => {
  created = [];
  revoked = [];
  // jsdom has no createObjectURL — exactly like the harness note in R3-421.
  URL.createObjectURL = ((b: Blob) => {
    created.push(b);
    return `blob:devfs/${created.length}`;
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = ((u: string) => {
    revoked.push(u);
  }) as typeof URL.revokeObjectURL;
});

afterEach(() => {
  URL.createObjectURL = realCreate;
  URL.revokeObjectURL = realRevoke;
  delete (globalThis as { __sandpackSharedFs?: unknown }).__sandpackSharedFs;
});

const flush = async () => {
  // Each bridge call is two+ microtask hops (lazy shim, then the op); drain them.
  for (let i = 0; i < 5; i++) await act(async () => {});
};

it('sandboxFs() discovers the dev-fs-shaped bridge (fsAvailable flips true)', () => {
  expect(fsAvailable()).toBe(false); // plain vite dev, no plugin
  install(devFsBridge({}));
  expect(fsAvailable()).toBe(true); // vite dev + dev-fs >= 0.5.0
});

it('readObjectUrl works through the lazy bridge over the virtual layout', async () => {
  install(devFsBridge({ '/spaces/ab12cd34/photos/cat.png': 'png-bytes' }));
  const { url, revoke } = await openFs(spaceMount()).readObjectUrl('photos/cat.png');
  expect(url).toBe('blob:devfs/1');
  expect(created[0].type).toBe('image/png'); // MIME inferred from the extension
  revoke();
  expect(revoked).toEqual(['blob:devfs/1']);
});

it('useObjectUrl resolves a url via the bridge and revokes it on unmount', async () => {
  install(devFsBridge({ '/spaces/ab12cd34/photos/cat.png': 'png-bytes' }));
  const states: ReturnType<typeof useObjectUrl>[] = [];
  const Probe = () => {
    states.push(useObjectUrl(spaceMount(), 'photos/cat.png'));
    return null;
  };
  const el = document.createElement('div');
  const root = createRoot(el);
  await act(async () => root.render(<Probe />));
  await flush();
  const last = states[states.length - 1];
  expect(last).toEqual({ url: 'blob:devfs/1', loading: false, error: null });
  await act(async () => root.unmount());
  expect(revoked).toEqual(['blob:devfs/1']);
});

it('useObjectUrl surfaces a bridge miss as a mapped FsError, not a hang', async () => {
  install(devFsBridge({}));
  const states: ReturnType<typeof useObjectUrl>[] = [];
  const Probe = () => {
    states.push(useObjectUrl(spaceMount(), 'missing.png'));
    return null;
  };
  const el = document.createElement('div');
  const root = createRoot(el);
  await act(async () => root.render(<Probe />));
  await flush();
  const last = states[states.length - 1];
  expect(last.loading).toBe(false);
  expect(last.url).toBeNull();
  expect(last.error?.code).toBe('not-found');
  await act(async () => root.unmount());
});
