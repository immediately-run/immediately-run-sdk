// tasks.invoke.test.ts — invokeTask's envelope unwrap (R3-816). Separate from
// tasks.test.ts on purpose: that file drives the REAL transport-less path
// ('no host transport'); this file mocks sandboxUtils to answer envelopes.
// Each refusal case here reddens when throwOnRefusal's body is neutered —
// nothing downstream of it re-checks the envelope.

jest.mock('./sandboxUtils', () => ({
  protocolRequest: jest.fn(),
  sendMessage: jest.fn(),
  addListener: jest.fn(() => () => undefined),
}));

import { protocolRequest } from './sandboxUtils';
import { invokeTask } from './tasks';

const mockRequest = protocolRequest as jest.MockedFunction<typeof protocolRequest>;

beforeEach(() => {
  mockRequest.mockReset();
});

describe('invokeTask envelope unwrap', () => {
  it('maps the task onto the wire and returns the success data', async () => {
    mockRequest.mockResolvedValue({ ok: true, data: { file: 'a.md' } });
    await expect(invokeTask<{ file: string }>('pick-file', { mode: 'open' })).resolves.toEqual({
      file: 'a.md',
    });
    expect(mockRequest).toHaveBeenCalledWith('task', 'invoke', [{ task: 'pick-file', params: { mode: 'open' } }]);
  });

  it('a refusal throws with the code INSIDE the envelope', async () => {
    mockRequest.mockResolvedValue({ ok: false, code: 'cancelled', message: 'user declined' });
    await expect(invokeTask('pick-file', {})).rejects.toMatchObject({ code: 'cancelled' });
  });

  it('a refusal without a code throws as unknown', async () => {
    mockRequest.mockResolvedValue({ ok: false });
    await expect(invokeTask('pick-file', {})).rejects.toMatchObject({ code: 'unknown' });
  });

  it('an ABSENT reply throws as unknown and names the task — the !res guard', async () => {
    mockRequest.mockResolvedValue(undefined);
    await expect(invokeTask('pick-file', {})).rejects.toMatchObject({
      code: 'unknown',
      message: "task 'pick-file' failed",
    });
  });
});
