// R3-158 — the `launch` SDK surface (STANDING_APP_LIFECYCLE_SPEC §2). Driven
// against a mocked transport: assert `launch` resolves a handle on host `ok:true`,
// returns `{ok:false,code}` (never throws) on refusal, that `dismiss()` posts a
// `launch-dismiss`, and that a `launch-ended` message drives status + fires
// `onDismiss` exactly once — identically for dismiss/revoke/failed (R-SAL-1).
type Listener = (msg: Record<string, unknown>) => void;
const listeners: Record<string, Listener[]> = {};
const sendMessage = jest.fn();
const protocolRequest = jest.fn();

jest.mock('./sandboxUtils', () => ({
  protocolRequest: (...args: unknown[]) => protocolRequest(...args),
  sendMessage: (...args: unknown[]) => sendMessage(...args),
  addListener: (type: string, h: Listener) => {
    (listeners[type] ||= []).push(h);
    return () => {
      listeners[type] = (listeners[type] || []).filter((x) => x !== h);
    };
  },
}));

type LaunchMod = typeof import('./launch');
let mod: LaunchMod;
const end = (launchId: string, status: string) =>
  (listeners['launch-ended'] || []).forEach((l) => l({ launchId, status }));

beforeEach(() => {
  jest.resetModules();
  for (const k of Object.keys(listeners)) delete listeners[k];
  sendMessage.mockReset();
  protocolRequest.mockReset();
  mod = require('./launch');
});

it('resolves a running handle on host ok:true and posts the create request', async () => {
  protocolRequest.mockResolvedValue({ ok: true, launchId: 'lx1' });
  const h = await mod.launch({ task: 'open-project' }, { region: 'stage', input: { dir: 1 } });
  expect(protocolRequest).toHaveBeenCalledWith('launch', 'create', [
    { target: { task: 'open-project' }, opts: { region: 'stage', input: { dir: 1 } } },
  ]);
  expect('ok' in h && h.ok === false).toBe(false);
  const handle = h as import('./launch').LaunchHandle;
  expect(handle.launchId).toBe('lx1');
  expect(handle.status).toBe('running');
});

it('returns {ok:false,code} on refusal and NEVER throws', async () => {
  protocolRequest.mockResolvedValue({ ok: false, code: 'forbidden' });
  const h = await mod.launch({ entryPoint: 'tag-manager' }, { region: 'overlay' });
  expect(h).toEqual({ ok: false, code: 'forbidden' });
});

it('maps a missing/garbled host reply to code:unknown', async () => {
  protocolRequest.mockResolvedValue(undefined);
  const h = await mod.launch({ task: 'x' }, { region: 'overlay' });
  expect(h).toEqual({ ok: false, code: 'unknown' });
});

it('dismiss() posts launch-dismiss with the launchId', async () => {
  protocolRequest.mockResolvedValue({ ok: true, launchId: 'lx2' });
  const handle = (await mod.launch({ task: 'x' }, { region: 'overlay' })) as import('./launch').LaunchHandle;
  handle.dismiss();
  expect(sendMessage).toHaveBeenCalledWith('launch-dismiss', { launchId: 'lx2' });
});

it('a launch-ended message drives status and fires onDismiss once', async () => {
  protocolRequest.mockResolvedValue({ ok: true, launchId: 'lx3' });
  const handle = (await mod.launch({ task: 'x' }, { region: 'overlay' })) as import('./launch').LaunchHandle;
  let fired = 0;
  handle.onDismiss(() => (fired += 1));
  expect(handle.status).toBe('running');
  end('lx3', 'revoked');
  expect(handle.status).toBe('revoked');
  expect(fired).toBe(1);
  end('lx3', 'dismissed'); // a duplicate terminal message is a no-op
  expect(fired).toBe(1);
  expect(handle.status).toBe('revoked');
});

it('dismiss after end is a no-op (idempotent)', async () => {
  protocolRequest.mockResolvedValue({ ok: true, launchId: 'lx4' });
  const handle = (await mod.launch({ task: 'x' }, { region: 'overlay' })) as import('./launch').LaunchHandle;
  end('lx4', 'dismissed');
  sendMessage.mockReset();
  handle.dismiss();
  expect(sendMessage).not.toHaveBeenCalled();
});

it('onDismiss on an already-ended handle still fires (next tick) and unsubscribe is safe', async () => {
  protocolRequest.mockResolvedValue({ ok: true, launchId: 'lx5' });
  const handle = (await mod.launch({ task: 'x' }, { region: 'overlay' })) as import('./launch').LaunchHandle;
  end('lx5', 'failed');
  let fired = 0;
  const off = handle.onDismiss(() => (fired += 1));
  off(); // unsubscribe of an already-ended handle is a safe no-op
  await Promise.resolve(); // flush the queued microtask
  expect(fired).toBe(1);
});

it('a terminal message for an unknown launchId is ignored', async () => {
  protocolRequest.mockResolvedValue({ ok: true, launchId: 'lx6' });
  const handle = (await mod.launch({ task: 'x' }, { region: 'overlay' })) as import('./launch').LaunchHandle;
  end('some-other-id', 'revoked');
  expect(handle.status).toBe('running');
});
