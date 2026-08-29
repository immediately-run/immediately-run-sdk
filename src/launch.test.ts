// R3-158 — the `launch` SDK surface (STANDING_APP_LIFECYCLE_SPEC §2). Driven
// against a mocked transport: assert `launch` resolves a handle on host `ok:true`,
// returns `{ok:false,code}` (never throws) on refusal, that `dismiss()` posts a
// `launch-dismiss`, and that a `launch-ended` message drives status + fires
// `onDismiss` exactly once — identically for dismiss/revoke/failed (R-SAL-1).
export {}; // make this a MODULE — else its top-level `Listener`/`listeners` become
// GLOBAL script declarations and collide with the same names in debug.test.ts under
// the shared tsc typecheck (TS2300), which jest's per-file isolation never surfaces.
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
  protocolRequest.mockResolvedValue({ ok: true, data: { launchId: 'lx1' } });
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
  protocolRequest.mockResolvedValue({ ok: true, data: { launchId: 'lx2' } });
  const handle = (await mod.launch({ task: 'x' }, { region: 'overlay' })) as import('./launch').LaunchHandle;
  handle.dismiss();
  expect(sendMessage).toHaveBeenCalledWith('launch-dismiss', { launchId: 'lx2' });
});

it('a launch-ended message drives status and fires onDismiss once', async () => {
  protocolRequest.mockResolvedValue({ ok: true, data: { launchId: 'lx3' } });
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
  protocolRequest.mockResolvedValue({ ok: true, data: { launchId: 'lx4' } });
  const handle = (await mod.launch({ task: 'x' }, { region: 'overlay' })) as import('./launch').LaunchHandle;
  end('lx4', 'dismissed');
  sendMessage.mockReset();
  handle.dismiss();
  expect(sendMessage).not.toHaveBeenCalled();
});

it('onDismiss on an already-ended handle still fires (next tick) and unsubscribe is safe', async () => {
  protocolRequest.mockResolvedValue({ ok: true, data: { launchId: 'lx5' } });
  const handle = (await mod.launch({ task: 'x' }, { region: 'overlay' })) as import('./launch').LaunchHandle;
  end('lx5', 'failed');
  let fired = 0;
  const off = handle.onDismiss(() => (fired += 1));
  off(); // unsubscribe of an already-ended handle is a safe no-op
  await Promise.resolve(); // flush the queued microtask
  expect(fired).toBe(1);
});

it('a terminal message for an unknown launchId is ignored', async () => {
  protocolRequest.mockResolvedValue({ ok: true, data: { launchId: 'lx6' } });
  const handle = (await mod.launch({ task: 'x' }, { region: 'overlay' })) as import('./launch').LaunchHandle;
  end('some-other-id', 'revoked');
  expect(handle.status).toBe('running');
});

// ── the create-window race (review of R3-421) ────────────────────────────────
// The listener is registered before the create request, but the HANDLE only exists
// once the create response resolves. A launch that ends inside that gap used to be
// dropped: the handle stayed `running` for ever and `onDismiss` never fired — the one
// failure a launcher can neither detect nor recover from. These drive a `launch-ended`
// in exactly that window.
describe('a launch-ended that arrives before the handle lands', () => {
  /** A create whose response we resolve by hand, so the window stays open. */
  const deferredCreate = (): { resolve: (v: unknown) => void } => {
    let resolve!: (v: unknown) => void;
    protocolRequest.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    return { resolve };
  };

  it('is applied to the handle instead of dropped', async () => {
    const create = deferredCreate();
    const pending = mod.launch({ task: 'x' }, { region: 'overlay' });
    await Promise.resolve(); // let launch() reach its await — the window is now open
    end('lx7', 'dismissed'); // the launch ends before its handle exists
    create.resolve({ ok: true, data: { launchId: 'lx7' } });
    const handle = (await pending) as import('./launch').LaunchHandle;

    expect(handle.status).toBe('dismissed');
    let fired = 0;
    handle.onDismiss(() => (fired += 1));
    await Promise.resolve(); // an already-ended handle fires onDismiss next tick
    expect(fired).toBe(1);
    handle.dismiss(); // and it is already terminal: no dismiss goes to the host
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("keeps each launch's own terminal status when two creates overlap", async () => {
    let resolveA!: (v: unknown) => void;
    let resolveB!: (v: unknown) => void;
    protocolRequest
      .mockReturnValueOnce(
        new Promise((r) => {
          resolveA = r;
        }),
      )
      .mockReturnValueOnce(
        new Promise((r) => {
          resolveB = r;
        }),
      );
    const a = mod.launch({ task: 'a' }, { region: 'overlay' });
    const b = mod.launch({ task: 'b' }, { region: 'overlay' });
    await Promise.resolve();
    end('lxB', 'revoked'); // only B ends inside the window
    resolveA({ ok: true, data: { launchId: 'lxA' } });
    resolveB({ ok: true, data: { launchId: 'lxB' } });
    const [ha, hb] = (await Promise.all([a, b])) as import('./launch').LaunchHandle[];
    expect(ha.status).toBe('running');
    expect(hb.status).toBe('revoked');
  });

  it('does not retain a buffered message once no create is in flight', async () => {
    const create = deferredCreate();
    const pending = mod.launch({ task: 'x' }, { region: 'overlay' });
    await Promise.resolve();
    end('lx8', 'revoked'); // buffered — but this create is refused, so it never lands
    create.resolve({ ok: false, code: 'forbidden' });
    expect(await pending).toEqual({ ok: false, code: 'forbidden' });

    // A LATER launch that happens to reuse the id must not inherit the stale status.
    protocolRequest.mockResolvedValue({ ok: true, data: { launchId: 'lx8' } });
    const handle = (await mod.launch({ task: 'x' }, { region: 'overlay' })) as import('./launch').LaunchHandle;
    expect(handle.status).toBe('running');
  });
});
