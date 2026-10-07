// Host-mediated bundle open (BUNDLE_EMBEDDING_SPEC §4b.9) — the wire shape, and that every
// coded refusal the host can resolve with surfaces as a typed throw rather than a silent
// success. The directory under test is built by `capDir`, the producer a file manager uses.

jest.mock('./sandboxUtils', () => ({
  protocolRequest: jest.fn(),
  // `tasks.ts` (for `capDir`) registers its listener at import; off-host that is a throw it
  // catches, which is the path a unit test of this wrapper wants.
  sendMessage: jest.fn(() => {
    throw new Error('no host transport');
  }),
  addListener: jest.fn(() => {
    throw new Error('no host transport');
  }),
}));

import { protocolRequest } from './sandboxUtils';
import { PROTOCOL_OPENBUNDLE } from './generated/protocol';
import { SCHEMES } from './protocolSchemes';
import { capDir } from './tasks';
import { OPEN_BUNDLE_REPLY_TIMEOUT_MS, openBundle, type OpenBundleError } from './openBundle';

const mockRequest = protocolRequest as jest.MockedFunction<typeof protocolRequest>;

/** The bound every call carries. */
const BOUND = { timeoutMs: OPEN_BUNDLE_REPLY_TIMEOUT_MS };

/** The folder a file manager has in hand: a read-only capability on a directory of a mount. */
const dir = capDir({ mountId: 'worktree', relPath: 'content/roadmap' }, { mode: 'ro' });

beforeEach(() => {
  mockRequest.mockReset();
  mockRequest.mockResolvedValue({ ok: true });
});

describe('openBundle', () => {
  it('maps to protocol-openbundle `open` with the directory capability alone', async () => {
    await openBundle({ dir });
    expect(mockRequest).toHaveBeenCalledWith(SCHEMES[PROTOCOL_OPENBUNDLE], 'open', [{ dir }], BOUND);
    const [, , params] = mockRequest.mock.calls[0];
    expect(Object.keys((params as Record<string, unknown>[])[0])).toEqual(['dir']);
  });

  it('adds the view by name when one is given', async () => {
    await openBundle({ dir, view: 'board' });
    expect(mockRequest).toHaveBeenCalledWith(SCHEMES[PROTOCOL_OPENBUNDLE], 'open', [{ dir, view: 'board' }], BOUND);
  });

  it('uses the scheme derived from the wire name, not a spelled literal', () => {
    expect(SCHEMES[PROTOCOL_OPENBUNDLE]).toBe('openbundle');
    expect(PROTOCOL_OPENBUNDLE).toBe('protocol-openbundle');
  });

  it('sends only the capability’s four fields and the view — never a caller-supplied url, app or path', async () => {
    const steering = {
      dir: { ...dir, url: 'https://evil.test', repo: 'github:evil/repo' },
      view: 'board',
      url: 'https://evil.test',
      app: 'github:evil/opener',
      path: '/edit/a/b/c',
    };
    await openBundle(steering as never);
    const [, , params] = mockRequest.mock.calls[0];
    const sent = (params as Record<string, unknown>[])[0];
    expect(Object.keys(sent).sort()).toEqual(['dir', 'view']);
    expect(Object.keys(sent.dir as object).sort()).toEqual(['$cap', 'mode', 'mountId', 'relPath']);
    expect(sent).toEqual({ dir, view: 'board' });
  });

  it('resolves when the host performed the open', async () => {
    await expect(openBundle({ dir })).resolves.toBeUndefined();
  });

  // The whole class the host can refuse with: a refusal resolves inside the reply, so a code
  // this wrapper failed to treat as a failure would read as an open that never happened.
  it.each(['invalid-params', 'invalid', 'unaddressable', 'no-activation', 'forbidden', 'unsupported'])(
    'surfaces a `%s` refusal as a typed throw',
    async (code) => {
      mockRequest.mockResolvedValue({ ok: false, code, message: `refused: ${code}` });
      const err = await openBundle({ dir }).catch((e: OpenBundleError) => e);
      expect(err).toBeInstanceOf(Error);
      expect((err as OpenBundleError).code).toBe(code);
      expect((err as OpenBundleError).message).toBe(`refused: ${code}`);
    },
  );

  it('defaults to `unknown` when the host refuses without a code', async () => {
    mockRequest.mockResolvedValue({ ok: false });
    const err = await openBundle({ dir }).catch((e: OpenBundleError) => e);
    expect((err as OpenBundleError).code).toBe('unknown');
    expect((err as OpenBundleError).message).toBe('bundle open refused');
  });

  it.each([
    ['a null reply', null],
    ['an undefined reply', undefined],
    ['a bare-promise (envelope-less) reply', { url: '/present/github/immediately-run/docs' }],
  ])('treats %s as a failure, never a silent success', async (_label, reply) => {
    mockRequest.mockResolvedValue(reply as never);
    const err = await openBundle({ dir }).catch((e: OpenBundleError) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as OpenBundleError).code).toBe('unknown');
  });

  // A host that predates this call never answers it. The wait is bounded far below the
  // default so a click does not sit dead before the caller falls back to its overlay.
  it('bounds the wait tightly, and the expiry surfaces as `timeout`', async () => {
    expect(OPEN_BUNDLE_REPLY_TIMEOUT_MS).toBeLessThanOrEqual(3000);
    // What the SDK's deadline rejects with when no reply arrives in time.
    mockRequest.mockRejectedValue(Object.assign(new Error('did not respond'), { code: 'timeout' }));
    const err = await openBundle({ dir }).catch((e: OpenBundleError) => e);
    expect((err as OpenBundleError).code).toBe('timeout');
    expect(mockRequest.mock.calls[0][3]).toEqual(BOUND);
  });

  it.each([
    ['no dir', {}],
    ['a null dir', { dir: null }],
    ['no target at all', undefined],
  ])('%s is sent for the host to refuse with a code — never an uncoded TypeError here', async (_label, target) => {
    mockRequest.mockResolvedValue({
      ok: false,
      code: 'invalid-params',
      message: 'dir (directory capability) required',
    });
    const err = await openBundle(target as never).catch((e: OpenBundleError) => e);
    expect((err as OpenBundleError).code).toBe('invalid-params');
    const [, , params] = mockRequest.mock.calls[0];
    expect((params as Record<string, unknown>[])[0]).toEqual({
      dir: { $cap: undefined, mountId: undefined, relPath: undefined, mode: undefined },
    });
  });
});
