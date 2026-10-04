// Editor SDK wrappers — assert each maps to the right `protocol-editor` method +
// param shape, and that a host `{ ok: false, code }` surfaces as a typed throw.
// (EDITOR_AS_APP_SPEC §5.1; editor-as-app plan Phase 03 for setActive/close.)

jest.mock('./sandboxUtils', () => ({
  protocolRequest: jest.fn(),
}));

import { protocolRequest } from './sandboxUtils';
import {
  openInEditor,
  requestEdit,
  setActiveFile,
  closeFile,
  createFile,
  uploadFile,
  type EditorSessionError,
} from './editor';

const mockRequest = protocolRequest as jest.MockedFunction<typeof protocolRequest>;

beforeEach(() => {
  mockRequest.mockReset();
  mockRequest.mockResolvedValue({ ok: true, data: undefined });
});

describe('editor SDK wrappers — request shape', () => {
  it.each([
    ['openInEditor', () => openInEditor('src/App.tsx'), 'open', { path: 'src/App.tsx' }],
    [
      'openInEditor + selection',
      () => openInEditor('src/App.tsx', { line: 12, column: 4 }),
      'open',
      { path: 'src/App.tsx', selection: { line: 12, column: 4 } },
    ],
    // R3-389: `reveal` travels only as the literal `true`, so a pre-reveal host sees
    // a plain open, and a selection and a reveal compose.
    [
      'openInEditor + reveal',
      () => openInEditor('src/App.tsx', undefined, { reveal: true }),
      'open',
      { path: 'src/App.tsx', reveal: true },
    ],
    [
      'openInEditor + selection + reveal',
      () => openInEditor('src/App.tsx', { line: 3 }, { reveal: true }),
      'open',
      { path: 'src/App.tsx', selection: { line: 3 }, reveal: true },
    ],
    [
      'openInEditor + reveal:false',
      () => openInEditor('src/App.tsx', undefined, { reveal: false }),
      'open',
      { path: 'src/App.tsx' },
    ],
    ['setActiveFile', () => setActiveFile('src/App.tsx'), 'setActive', { path: 'src/App.tsx' }],
    ['closeFile', () => closeFile('src/App.tsx'), 'close', { path: 'src/App.tsx' }],
    ['createFile', () => createFile('src/new.ts'), 'createFile', { path: 'src/new.ts' }],
    // R3-876: the bundleFile target class travels as that shape (and no other key).
    [
      'requestEdit({ bundleFile })',
      () => requestEdit({ bundleFile: '/notes/idea.mdx' }),
      'requestEdit',
      { bundleFile: '/notes/idea.mdx' },
    ],
    [
      'requestEdit({ file })',
      () => requestEdit({ file: { mountId: 'space:abc', relPath: '/n.mdx' } }),
      'requestEdit',
      { file: { mountId: 'space:abc', relPath: '/n.mdx' } },
    ],
    ['requestEdit()', () => requestEdit(), 'requestEdit', {}],
  ])('%s → protocol-editor %s', async (_name, call, method, arg) => {
    await call();
    expect(mockRequest).toHaveBeenCalledWith('editor', method, [arg]);
  });
});

describe('requestEdit — client-side mutual exclusion (R3-876)', () => {
  it.each([
    ['path + bundleFile', { path: 'a.ts', bundleFile: '/notes/idea.mdx' }],
    ['file + bundleFile', { file: { mountId: 'space:abc', relPath: '/n.mdx' }, bundleFile: '/notes/idea.mdx' }],
    ['path + file', { path: 'a.ts', file: { mountId: 'space:abc', relPath: '/n.mdx' } }],
    ['all three', { path: 'a.ts', file: { mountId: 'space:abc', relPath: '/n.mdx' }, bundleFile: '/x.mdx' }],
  ])('%s is refused invalid-params BEFORE the wire', async (_name, target) => {
    await expect(requestEdit(target)).rejects.toMatchObject({ code: 'invalid-params' });
    expect(mockRequest).not.toHaveBeenCalled();
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

describe('uploadFile — the too-large refusal carries limitBytes (R3-853)', () => {
  it('attaches the host-sent limitBytes to the thrown error', async () => {
    mockRequest.mockResolvedValue({ ok: false, code: 'too-large', message: 'over', limitBytes: 26214400 } as never);
    const err = await uploadFile('/big.png', new Uint8Array(4)).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'too-large', limitBytes: 26214400 });
  });

  it('an older host (no limitBytes on the reply) rejects without the field', async () => {
    mockRequest.mockResolvedValue({ ok: false, code: 'too-large', message: 'over' });
    const err = await uploadFile('/big.png', new Uint8Array(4)).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'too-large' });
    expect((err as { limitBytes?: unknown }).limitBytes).toBeUndefined();
  });
});

describe('editorRequest — a malformed reply is a coded refusal, never a TypeError (R3-817, R3-853 review)', () => {
  it('a null reply rejects coded — the limitBytes read never masks it', async () => {
    mockRequest.mockResolvedValue(null as never);
    const err = await uploadFile('/big.png', new Uint8Array(4)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as { code?: string }).code).toBe('unknown');
  });
});
