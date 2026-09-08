// The recent-projects wrappers — assert the wire shape, that the host's
// `{ ok, data }` / `{ ok: false, code }` envelope is unwrapped (success reads
// `data`, a refusal THROWS with its code preserved), and that a cleared
// record's `null` survives as `null` rather than collapsing into a refusal.

jest.mock('./sandboxUtils', () => ({
  protocolRequest: jest.fn(),
}));

import { protocolRequest } from './sandboxUtils';
import { clearRecentProjects, listRecentProjects, type RecentProject } from './recents';

const mockRequest = protocolRequest as jest.MockedFunction<typeof protocolRequest>;

const project: RecentProject = {
  provider: 'github',
  namespace: 'acme',
  repository: 'todo',
  ref: 'main',
  ts: 0,
};

beforeEach(() => {
  mockRequest.mockReset();
});

describe('listRecentProjects', () => {
  it('maps to protocol-recents list with empty params', async () => {
    mockRequest.mockResolvedValue({ ok: true, data: { projects: null } });
    await listRecentProjects();
    expect(mockRequest).toHaveBeenCalledWith('recents', 'list', [{}]);
  });

  it('unwraps the populated envelope', async () => {
    mockRequest.mockResolvedValue({ ok: true, data: { projects: [project] } });
    await expect(listRecentProjects()).resolves.toEqual([project]);
  });

  it('a cleared record is null — absent, never an empty list', async () => {
    mockRequest.mockResolvedValue({ ok: true, data: { projects: null } });
    await expect(listRecentProjects()).resolves.toBeNull();
  });

  it('a refusal resolves with the code INSIDE the envelope and must throw it, not read the body', async () => {
    mockRequest.mockResolvedValue({ ok: false, code: 'forbidden', message: 'not the page.home binding' });
    await expect(listRecentProjects()).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('a refusal without a code still throws, as unknown', async () => {
    mockRequest.mockResolvedValue({ ok: false });
    await expect(listRecentProjects()).rejects.toMatchObject({ code: 'unknown' });
  });
});

describe('clearRecentProjects', () => {
  it('maps to protocol-recents list with the clear flag', async () => {
    mockRequest.mockResolvedValue({ ok: true, data: { projects: null } });
    await clearRecentProjects();
    expect(mockRequest).toHaveBeenCalledWith('recents', 'list', [{ clear: true }]);
  });

  it('a refused clear throws — the caller must not treat the record as cleared', async () => {
    mockRequest.mockResolvedValue({ ok: false, code: 'forbidden', message: 'declined' });
    await expect(clearRecentProjects()).rejects.toMatchObject({ code: 'forbidden' });
  });
});
