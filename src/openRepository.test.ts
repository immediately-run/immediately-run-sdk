// Host-mediated repository open (R3-476) — assert the wire shape, and that every coded
// refusal the host can resolve with surfaces as a typed throw rather than a silent success.
//
// The coordinates under test are built field by field from a `RecentProject`, the shape the
// R3-475 rows actually hold, so the call site this wrapper exists for is the producer of the
// input rather than a literal typed here.

jest.mock('./sandboxUtils', () => ({
  protocolRequest: jest.fn(),
}));

import { protocolRequest } from './sandboxUtils';
import { PROTOCOL_OPENREPO } from './generated/protocol';
import { SCHEMES } from './protocolSchemes';
import { openRepository, type OpenRepositoryError } from './openRepository';
import type { RecentProject } from './recents';

const mockRequest = protocolRequest as jest.MockedFunction<typeof protocolRequest>;

/** A row as `listRecentProjects()` returns it — the real producer of this call's input. */
const recent: RecentProject = {
  provider: 'github',
  namespace: 'immediately-run',
  repository: 'docs',
  ref: 'main',
  ts: 1_700_000_000_000,
};

const coordinates = {
  provider: recent.provider,
  namespace: recent.namespace,
  repository: recent.repository,
};

beforeEach(() => {
  mockRequest.mockReset();
  mockRequest.mockResolvedValue({ ok: true });
});

describe('openRepository', () => {
  it('maps to protocol-openrepo `open` with the three coordinates', async () => {
    await openRepository(coordinates);
    expect(mockRequest).toHaveBeenCalledWith(SCHEMES[PROTOCOL_OPENREPO], 'open', [coordinates]);
  });

  it('uses the scheme derived from the wire name, not a spelled literal', () => {
    // The derivation is what keeps the scheme unfalsifiable — asserting it here means a
    // renamed wire name fails this test rather than producing an empty scheme at runtime.
    expect(SCHEMES[PROTOCOL_OPENREPO]).toBe('openrepo');
    expect(PROTOCOL_OPENREPO).toBe('protocol-openrepo');
  });

  it('sends ONLY the coordinates — never a caller-supplied url, path or ref', async () => {
    await openRepository({ ...coordinates, url: 'https://evil.test', path: '/edit/a/b/c' } as never);
    expect(mockRequest).toHaveBeenCalledWith(SCHEMES[PROTOCOL_OPENREPO], 'open', [coordinates]);
    const [, , params] = mockRequest.mock.calls[0];
    expect(Object.keys((params as Record<string, unknown>[])[0]).sort()).toEqual([
      'namespace',
      'provider',
      'repository',
    ]);
  });

  it('resolves when the host performed the open', async () => {
    mockRequest.mockResolvedValue({ ok: true, url: '/present/github/immediately-run/docs' });
    await expect(openRepository(coordinates)).resolves.toBeUndefined();
  });

  // The whole class the host can refuse with, not one favourite member: a refusal resolves
  // INSIDE the reply, so any code this wrapper failed to treat as a failure would read as a
  // successful open that never happened.
  it.each(['invalid', 'no-activation', 'forbidden', 'unsupported'])(
    'surfaces a `%s` refusal as a typed throw',
    async (code) => {
      mockRequest.mockResolvedValue({ ok: false, code, message: `refused: ${code}` });
      const err = await openRepository(coordinates).catch((e: OpenRepositoryError) => e);
      expect(err).toBeInstanceOf(Error);
      expect((err as OpenRepositoryError).code).toBe(code);
      expect((err as OpenRepositoryError).message).toBe(`refused: ${code}`);
    },
  );

  it('defaults to `unknown` when the host refuses without a code', async () => {
    mockRequest.mockResolvedValue({ ok: false });
    const err = await openRepository(coordinates).catch((e: OpenRepositoryError) => e);
    expect((err as OpenRepositoryError).code).toBe('unknown');
    expect((err as OpenRepositoryError).message).toBe('repository open refused');
  });

  it.each([
    ['a null reply', null],
    ['an undefined reply', undefined],
    ['a bare-promise (envelope-less) reply', { url: '/present/github/immediately-run/docs' }],
  ])('treats %s as a failure, never a silent success', async (_label, reply) => {
    mockRequest.mockResolvedValue(reply as never);
    const err = await openRepository(coordinates).catch((e: OpenRepositoryError) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as OpenRepositoryError).code).toBe('unknown');
  });
});
