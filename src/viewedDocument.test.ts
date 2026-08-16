/**
 * @jest-environment jsdom
 */
// R3-268 — the viewed-document hint's SDK halves:
//  - `navigate(target, opts)` encodes the tri-state on the `urlchange` wire
//    (absent stays ABSENT — the "derive by convention" arm — and null crosses
//    as null, never dropped by serialization);
//  - the `editor-context` parser tolerates hosts on either side of the change.
import * as sandboxUtils from './sandboxUtils';
import { navigate } from './routing';

jest.mock('./sandboxUtils', () => ({
  ...jest.requireActual('./sandboxUtils'),
  sendMessage: jest.fn(),
}));

const sendMessage = sandboxUtils.sendMessage as jest.Mock;

describe('navigate viewedDocument encoding (R3-268)', () => {
  beforeEach(() => sendMessage.mockClear());

  it('omitting the option keeps the field OFF the wire (URL-convention arm)', () => {
    navigate('/edit/x/y/z/main/files/a.md');
    const [type, data] = sendMessage.mock.calls[0];
    expect(type).toBe('urlchange');
    expect('viewedDocument' in data).toBe(false);
  });

  it('a declared path crosses verbatim', () => {
    navigate('/edit/x/y/z/main/files/a.md', { viewedDocument: 'content/a.md' });
    expect(sendMessage.mock.calls[0][1].viewedDocument).toBe('content/a.md');
  });

  it('an explicit null crosses as null (clear-the-highlight arm)', () => {
    navigate('/edit/x/y/z/main/tags', { viewedDocument: null });
    const data = sendMessage.mock.calls[0][1];
    expect('viewedDocument' in data).toBe(true);
    expect(data.viewedDocument).toBeNull();
  });
});

describe('editor-context viewedFile parsing (R3-268)', () => {
  it('an older host omitting viewedFile reads as null; a push carrying it lands', async () => {
    // The channel wires its transport at import time — hand it the §4 discovery
    // global with a capturable onMessage before the module loads.
    let handler: ((msg: any) => void) | undefined;
    (globalThis as any).__immediatelyRun__ = {
      transport: {
        sendMessage: jest.fn(),
        protocolRequest: jest.fn(),
        onMessage: (h: (msg: any) => void) => {
          handler = h;
          return { dispose() {} };
        },
      },
    };
    const { getEditorContext } = await import('./editorContext');
    // Older host: field absent → null, never a throw.
    handler?.({ type: 'editor-context', dirtyPaths: [], openFiles: [], activeFile: null });
    expect(getEditorContext().viewedFile).toBeNull();
    // Newer host: the hint lands verbatim.
    handler?.({
      type: 'editor-context',
      dirtyPaths: [],
      openFiles: [],
      activeFile: null,
      viewedFile: '/content/themes.mdx',
    });
    expect(getEditorContext().viewedFile).toBe('/content/themes.mdx');
    delete (globalThis as any).__immediatelyRun__;
  });
});
