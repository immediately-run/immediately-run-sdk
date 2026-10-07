// The method catalog's generic invoke (UI_AS_APPS_SPEC §5.5) — the refusal
// surfacing, driven through the real protocol mock the sibling suites use.
// The input names are REAL catalog names (the verbs `vcs.ts` ships), never
// invented `scheme:method` spellings, and the reply shapes are the envelope's
// own (R3-954's `retryAfter` included).
jest.mock('./sandboxUtils', () => ({
  protocolRequest: jest.fn(),
  sendMessage: jest.fn(),
  addListener: jest.fn(),
}));

import { protocolRequest } from './sandboxUtils';
import { invoke } from './catalog';
import { bundleHead } from './vcs';

type CodedError = Error & { code?: string; message?: string; retryAfter?: number };
const mockRequest = protocolRequest as jest.MockedFunction<typeof protocolRequest>;

beforeEach(() => {
  mockRequest.mockReset();
});

describe('invoke — the refusal surfaces the whole gate verdict', () => {
  it('unwraps the ok envelope', async () => {
    mockRequest.mockResolvedValue({ ok: true, data: 42 });
    await expect(invoke('vcs:head', { mountId: 'm' })).resolves.toBe(42);
  });

  it('throws the refusal with its code and message', async () => {
    mockRequest.mockResolvedValue({ ok: false, code: 'forbidden', message: 'not granted' });
    const err = (await invoke('vcs:log', { mountId: 'm' }).catch((e: CodedError) => e)) as CodedError;
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('forbidden');
    expect(err.message).toBe('not granted');
  });

  it('R3-954: a rate-limit refusal carries its wait in retryAfter seconds', async () => {
    mockRequest.mockResolvedValue({ ok: false, code: 'budget', message: 'rate-limited', retryAfter: 30 });
    const err = (await invoke('vcs:read', { mountId: 'm', paths: [] }).catch((e: CodedError) => e)) as CodedError;
    expect(err.code).toBe('budget');
    expect(err.retryAfter).toBe(30);
  });

  it('a refusal without retryAfter sets no retryAfter field', async () => {
    mockRequest.mockResolvedValue({ ok: false, code: 'forbidden' });
    const err = (await invoke('vcs:diffPaths', { mountId: 'm', from: 'a', to: 'b' }).catch(
      (e: CodedError) => e,
    )) as CodedError;
    expect('retryAfter' in err).toBe(false);
    expect(err.retryAfter).toBeUndefined();
  });

  it('a non-number retryAfter is never copied onto the error', async () => {
    mockRequest.mockResolvedValue({ ok: false, code: 'budget', retryAfter: '30' });
    const err = (await invoke('vcs:isAncestor', { mountId: 'm', a: 'x', b: 'y' }).catch(
      (e: CodedError) => e,
    )) as CodedError;
    expect(err.retryAfter).toBeUndefined();
  });

  it('an envelope-less reply is a failure, never a silent success', async () => {
    mockRequest.mockResolvedValue({ data: 1 } as never);
    const err = (await invoke('vcs:canWrite', { mountId: 'm' }).catch((e: CodedError) => e)) as CodedError;
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('unknown');
  });

  it('the names this file drives are the real verbs the catalog sibling ships', () => {
    // Non-vacuity against the producer: the verb wrappers this suite invokes
    // through must exist and be functions, so a renamed verb fails here rather
    // than turning every case above into an untested spelling.
    expect(typeof bundleHead).toBe('function');
  });
});
