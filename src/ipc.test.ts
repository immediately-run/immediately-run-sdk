// IPC SDK wrappers (UI_AS_APPS_SPEC §5.6 messaging + §4.1 reveal, R3-243) — assert
// each maps to the right `protocol-ipc` method + param shape, and that a host
// refusal surfaces as a typed throw carrying the host's `code`.

jest.mock('./sandboxUtils', () => ({
  protocolRequest: jest.fn(),
  addListener: jest.fn(() => () => {}),
}));

import { protocolRequest } from './sandboxUtils';
import { postToRegion, revealRegion } from './ipc';

const mockRequest = protocolRequest as jest.MockedFunction<typeof protocolRequest>;

beforeEach(() => {
  mockRequest.mockReset();
  mockRequest.mockResolvedValue({ ok: true });
});

describe('ipc SDK wrappers — request shape', () => {
  it('postToRegion → protocol-ipc post', async () => {
    await postToRegion('stage.conversation', { type: 'select-conversation', id: 'c1' });
    expect(mockRequest).toHaveBeenCalledWith('ipc', 'post', [
      { to: 'stage.conversation', msg: { type: 'select-conversation', id: 'c1' } },
    ]);
  });

  it('revealRegion → protocol-ipc reveal, naming a REGION and never a column', async () => {
    await revealRegion('stage.conversation');
    expect(mockRequest).toHaveBeenCalledWith('ipc', 'reveal', [{ to: 'stage.conversation' }]);
    // FT-2: the app names where it wants the user taken by REGION; the host maps that
    // to a column from its own layout. No column vocabulary crosses this boundary.
    const [, , params] = mockRequest.mock.calls[0];
    expect(JSON.stringify(params)).not.toMatch(/main-pane|sidebar|preview/);
  });
});

describe('ipc SDK wrappers — host refusal', () => {
  it.each([
    ['postToRegion', () => postToRegion('panel.files', {})],
    ['revealRegion', () => revealRegion('panel.files')],
  ])('%s surfaces the host code as a typed throw', async (_n, call) => {
    mockRequest.mockResolvedValue({ ok: false, code: 'forbidden', message: 'nope' });
    await expect(call()).rejects.toMatchObject({ code: 'forbidden', message: 'nope' });
  });

  it.each([
    ['postToRegion', () => postToRegion('panel.files', {})],
    ['revealRegion', () => revealRegion('panel.files')],
  ])('%s treats an absent reply as a failure, not a success', async (_n, call) => {
    mockRequest.mockResolvedValue(undefined);
    await expect(call()).rejects.toMatchObject({ code: 'unknown' });
  });
});

describe('revealRegion — deliberately opaque outcome', () => {
  it('resolves to undefined even when the host reports it did not move focus', async () => {
    // The host answers `{ok:true}` whether or not the user was actually moved
    // (activation, rate limit, already-there). The SDK exposes no way to tell, so an
    // app cannot build a retry loop around a refused reveal — that loop is exactly
    // the attention-steal behaviour the §4.1 gate exists to stop.
    mockRequest.mockResolvedValue({ ok: true });
    await expect(revealRegion('stage.conversation')).resolves.toBeUndefined();
  });
});
