// Host-mediated external-link open (R3-619) — assert the wire shape, and that every coded
// refusal the host can resolve with surfaces as a typed throw rather than a silent success.
//
// Mirror of `openRepository.test.ts`: the same envelope, refusal, and unfalsifiable-scheme
// assertions, extended by the one extra code this affordance adds — `declined` (the host
// showed the confirmation and the user declined), which a coordinate-based open has no cause
// to produce because it is unconfirmed.

jest.mock('./sandboxUtils', () => ({
  protocolRequest: jest.fn(),
}));

import { protocolRequest } from './sandboxUtils';
import { PROTOCOL_OPENLINK } from './generated/protocol';
import { SCHEMES } from './protocolSchemes';
import { openExternal, type OpenExternalError } from './openExternal';

const mockRequest = protocolRequest as jest.MockedFunction<typeof protocolRequest>;

const URL = 'https://github.com/immediately-run/docs/compare/main...main';

beforeEach(() => {
  mockRequest.mockReset();
  mockRequest.mockResolvedValue({ ok: true });
});

describe('openExternal', () => {
  it('maps to protocol-openlink `open` with the single url', async () => {
    await openExternal(URL);
    expect(mockRequest).toHaveBeenCalledWith(SCHEMES[PROTOCOL_OPENLINK], 'open', [{ url: URL }]);
  });

  it('uses the scheme derived from the wire name, not a spelled literal', () => {
    // The derivation is what keeps the scheme unfalsifiable — asserting it here means a
    // renamed wire name fails this test rather than producing an empty scheme at runtime.
    expect(SCHEMES[PROTOCOL_OPENLINK]).toBe('openlink');
    expect(PROTOCOL_OPENLINK).toBe('protocol-openlink');
  });

  it('sends ONLY the url — never a caller-supplied extra field', async () => {
    await openExternal(URL);
    const [, , params] = mockRequest.mock.calls[0];
    expect(Object.keys((params as Record<string, unknown>[])[0]).sort()).toEqual(['url']);
  });

  it('resolves when the host performed the open', async () => {
    mockRequest.mockResolvedValue({ ok: true, url: URL });
    await expect(openExternal(URL)).resolves.toBeUndefined();
  });

  // The whole class the host can refuse with, not one favourite member: a refusal resolves
  // INSIDE the reply, so any code this wrapper failed to treat as a failure would read as a
  // successful open that never happened. `declined` is the code this affordance adds over
  // `openRepository`; `unsupported` is what an older host without the handler answers.
  it.each(['invalid', 'no-activation', 'declined', 'forbidden', 'unsupported'])(
    'surfaces a `%s` refusal as a typed throw',
    async (code) => {
      mockRequest.mockResolvedValue({ ok: false, code, message: `refused: ${code}` });
      const err = await openExternal(URL).catch((e: OpenExternalError) => e);
      expect(err).toBeInstanceOf(Error);
      expect((err as OpenExternalError).code).toBe(code);
      expect((err as OpenExternalError).message).toBe(`refused: ${code}`);
    },
  );

  it('defaults to `unknown` when the host refuses without a code', async () => {
    mockRequest.mockResolvedValue({ ok: false });
    const err = await openExternal(URL).catch((e: OpenExternalError) => e);
    expect((err as OpenExternalError).code).toBe('unknown');
    expect((err as OpenExternalError).message).toBe('external link open refused');
  });

  it.each([
    ['a null reply', null],
    ['an undefined reply', undefined],
    ['a bare-promise (envelope-less) reply', { url: URL }],
  ])('treats %s as a failure, never a silent success', async (_label, reply) => {
    mockRequest.mockResolvedValue(reply as never);
    const err = await openExternal(URL).catch((e: OpenExternalError) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as OpenExternalError).code).toBe('unknown');
  });
});
