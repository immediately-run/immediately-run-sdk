// catalog.test.ts — `invoke()`'s wire mapping and envelope unwrap (R3-816).
// The refusal path is throwOnRefusal itself: each REFUSAL case here reddens
// when that helper's body is neutered (the mapping/name cases never reach it),
// because nothing between the reply and the caller re-checks the envelope.

jest.mock('./sandboxUtils', () => ({
  protocolRequest: jest.fn(),
  sendMessage: jest.fn(),
  addListener: jest.fn(() => () => undefined),
}));

import { protocolRequest } from './sandboxUtils';
import { invoke } from './catalog';

const mockRequest = protocolRequest as jest.MockedFunction<typeof protocolRequest>;

beforeEach(() => {
  mockRequest.mockReset();
});

describe('invoke', () => {
  it('maps `scheme:method` onto the wire and unwraps the success envelope', async () => {
    mockRequest.mockResolvedValue({ ok: true, data: { answer: 42 } });
    await expect(invoke<{ answer: number }>('spaces:invite', { spaceId: 's1' })).resolves.toEqual({
      answer: 42,
    });
    expect(mockRequest).toHaveBeenCalledWith('spaces', 'invite', [{ spaceId: 's1' }]);
  });

  it('an invalid catalog name throws before any call', async () => {
    await expect(invoke('nocolon')).rejects.toThrow(/invalid catalog method name/);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('a refusal throws with the code INSIDE the envelope (never reads data off a refusal)', async () => {
    mockRequest.mockResolvedValue({ ok: false, code: 'forbidden', message: 'off-catalog' });
    await expect(invoke('spaces:invite', {})).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('a refusal without a code throws as unknown', async () => {
    mockRequest.mockResolvedValue({ ok: false });
    await expect(invoke('spaces:invite', {})).rejects.toMatchObject({ code: 'unknown' });
  });

  it('an ABSENT reply (transport settled with nothing) throws as unknown — the !res guard', async () => {
    mockRequest.mockResolvedValue(undefined);
    await expect(invoke('spaces:invite', {})).rejects.toMatchObject({
      code: 'unknown',
      message: 'spaces:invite failed',
    });
  });
});
