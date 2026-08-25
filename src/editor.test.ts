// Editor SDK wrappers — assert each maps to the right `protocol-editor` method +
// param shape, and that a host `{ ok: false, code }` surfaces as a typed throw.
// (EDITOR_AS_APP_SPEC §5.1; editor-as-app plan Phase 03 for setActive/close.)

jest.mock('./sandboxUtils', () => ({
  protocolRequest: jest.fn(),
}));

import { protocolRequest } from './sandboxUtils';
import { openInEditor, setActiveFile, closeFile, createFile, type EditorSessionError } from './editor';

const mockRequest = protocolRequest as jest.MockedFunction<typeof protocolRequest>;

beforeEach(() => {
  mockRequest.mockReset();
  mockRequest.mockResolvedValue({ ok: true, data: undefined });
});

describe('editor SDK wrappers — request shape', () => {
  it.each([
    ['openInEditor', () => openInEditor('src/App.tsx'), 'open', { path: 'src/App.tsx' }],
    ['setActiveFile', () => setActiveFile('src/App.tsx'), 'setActive', { path: 'src/App.tsx' }],
    ['closeFile', () => closeFile('src/App.tsx'), 'close', { path: 'src/App.tsx' }],
    ['createFile', () => createFile('src/new.ts'), 'createFile', { path: 'src/new.ts' }],
  ])('%s → protocol-editor %s', async (_name, call, method, arg) => {
    await call();
    expect(mockRequest).toHaveBeenCalledWith('editor', method, [arg]);
  });
});

describe('editor session intents — typed errors', () => {
  it('surfaces forbidden on setActiveFile (lacks editor:document)', async () => {
    mockRequest.mockResolvedValue({ ok: false, code: 'forbidden', message: 'no editor:document' });
    await expect(setActiveFile('src/App.tsx')).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('surfaces not-found on closeFile', async () => {
    mockRequest.mockResolvedValue({ ok: false, code: 'not-found', message: 'gone' });
    await expect(closeFile('ghost.ts')).rejects.toMatchObject({ code: 'not-found' });
  });

  it('defaults to unknown when the host returns no code', async () => {
    mockRequest.mockResolvedValue({ ok: false } as unknown as { ok: false; code: string; message: string });
    const err = await setActiveFile('x.ts').catch((e: EditorSessionError) => e);
    expect((err as EditorSessionError).code).toBe('unknown');
  });
});
