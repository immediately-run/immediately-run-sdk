// The method catalog's generic invoke (UI_AS_APPS_SPEC §5.5) — the refusal
// surfacing, driven through the real protocol mock the sibling suites use.
// The input names are the REAL catalog names the verbs `vcs.ts` ships (each
// one pinned against the sibling's own source in the non-vacuity case below),
// and the reply shapes are the envelope's own (R3-954's `retryAfter` included).
jest.mock('./sandboxUtils', () => ({
  protocolRequest: jest.fn(),
  sendMessage: jest.fn(),
  addListener: jest.fn(),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { protocolRequest } from './sandboxUtils';
import { invoke } from './catalog';
import * as vcs from './vcs';

type CodedError = Error & { code?: string; message?: string; retryAfter?: number };
const mockRequest = protocolRequest as jest.MockedFunction<typeof protocolRequest>;

beforeEach(() => {
  mockRequest.mockReset();
});

describe('invoke — the refusal surfaces the whole gate verdict', () => {
  it('unwraps the ok envelope', async () => {
    mockRequest.mockResolvedValue({ ok: true, data: 42 });
    await expect(invoke('vcs:bundleHead', { mountId: 'm' })).resolves.toBe(42);
  });

  it('throws the refusal with its code and message', async () => {
    mockRequest.mockResolvedValue({ ok: false, code: 'forbidden', message: 'not granted' });
    const err = (await invoke('vcs:bundleLog', { mountId: 'm' }).catch((e: CodedError) => e)) as CodedError;
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('forbidden');
    expect(err.message).toBe('not granted');
  });

  it('R3-954: a rate-limit refusal carries its wait in retryAfter seconds', async () => {
    mockRequest.mockResolvedValue({ ok: false, code: 'budget', message: 'rate-limited', retryAfter: 30 });
    const err = (await invoke('vcs:bundleRead', { mountId: 'm', paths: [] }).catch((e: CodedError) => e)) as CodedError;
    expect(err.code).toBe('budget');
    expect(err.retryAfter).toBe(30);
  });

  it('a refusal without retryAfter sets no retryAfter field', async () => {
    mockRequest.mockResolvedValue({ ok: false, code: 'forbidden' });
    const err = (await invoke('vcs:bundleDiffPaths', { mountId: 'm', from: 'a', to: 'b' }).catch(
      (e: CodedError) => e,
    )) as CodedError;
    expect('retryAfter' in err).toBe(false);
    expect(err.retryAfter).toBeUndefined();
  });

  it.each([
    ['a string', '30'],
    ['NaN, which the number-guard would admit', Number.NaN],
  ])('a non-finite or non-number retryAfter (%s) is never copied onto the error', async (_label, bad) => {
    mockRequest.mockResolvedValue({ ok: false, code: 'budget', retryAfter: bad });
    const err = (await invoke('vcs:bundleIsAncestor', { mountId: 'm', a: 'x', b: 'y' }).catch(
      (e: CodedError) => e,
    )) as CodedError;
    expect(err.retryAfter).toBeUndefined();
  });

  it('an envelope-less reply is a failure, never a silent success', async () => {
    mockRequest.mockResolvedValue({ data: 1 } as never);
    const err = (await invoke('vcs:bundleCanWrite', { mountId: 'm' }).catch((e: CodedError) => e)) as CodedError;
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('unknown');
  });

  it('the names this file drives are the real verbs the catalog sibling ships', () => {
    // Non-vacuity against the producer on BOTH halves: every wire name the
    // suite drives must be a wrapper that exists AND a spelling the sibling's
    // own source carries — a renamed or misspelled verb fails here rather than
    // turning the cases above into untested spellings.
    const driven = {
      bundleHead: 'vcs:bundleHead',
      bundleLog: 'vcs:bundleLog',
      bundleRead: 'vcs:bundleRead',
      bundleDiffPaths: 'vcs:bundleDiffPaths',
      bundleIsAncestor: 'vcs:bundleIsAncestor',
      bundleCanWrite: 'vcs:bundleCanWrite',
    };
    const vcsSource = readFileSync(join(__dirname, 'vcs.ts'), 'utf8');
    for (const [fn, wire] of Object.entries(driven)) {
      // No message arg here: this repo's expect typing takes one (the jest globals
      // build is stricter than the sibling repo's) — the loop member names the failure.
      expect(typeof vcs[fn]).toBe('function');
      expect(vcsSource).toContain(`'${wire}'`);
    }
  });
});
