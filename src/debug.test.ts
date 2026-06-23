/**
 * @jest-environment jsdom
 */
// System-app devtools SDK surface (plan: docs/plans/system-app-devtools.md).
// Driven against a mocked transport: the dev gate keeps `debug.log` and the
// DOM-read responder inert until the host pushes `debug-enabled`, then both work;
// the responder is read-only with a fixed vocabulary. Module-singleton channels →
// reset modules + re-require per test.
type Listener = (msg: Record<string, unknown>) => void;
const listeners: Record<string, Listener[]> = {};
const sendMessage = jest.fn();

jest.mock('./sandboxUtils', () => ({
  sendMessage: (...args: unknown[]) => sendMessage(...args),
  addListener: (type: string, h: Listener) => {
    (listeners[type] ||= []).push(h);
    return () => {
      listeners[type] = (listeners[type] || []).filter((x) => x !== h);
    };
  },
}));

type DebugMod = typeof import('./debug');
let mod: DebugMod;

const push = (type: string, msg: Record<string, unknown>) =>
  (listeners[type] || []).forEach((l) => l({ type, ...msg }));
const enable = () => push('debug-enabled', { enabled: true });

beforeEach(() => {
  jest.resetModules();
  for (const k of Object.keys(listeners)) delete listeners[k];
  sendMessage.mockReset();
  mod = require('./debug');
});

describe('dev gate', () => {
  it('starts disabled and polls the host', () => {
    expect(mod.isDebugEnabled()).toBe(false);
    expect(sendMessage).toHaveBeenCalledWith('request-debug-enabled');
  });

  it('flips on when the host pushes debug-enabled', () => {
    mod.isDebugEnabled(); // start the channel
    enable();
    expect(mod.isDebugEnabled()).toBe(true);
  });
});

describe('debug.log', () => {
  it('is a no-op until enabled (sends no debug-log)', () => {
    mod.debug.log('info', 'hi', { a: 1 });
    expect(sendMessage).not.toHaveBeenCalledWith('debug-log', expect.anything());
  });

  it('sends a structured entry once enabled', () => {
    mod.isDebugEnabled();
    enable();
    mod.debug.log('warn', 'careful', { n: 2 });
    expect(sendMessage).toHaveBeenCalledWith('debug-log', {
      level: 'warn',
      message: 'careful',
      data: { n: 2 },
    });
  });

  it('never throws on unserializable data', () => {
    mod.isDebugEnabled();
    enable();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => mod.debug.log('error', 'boom', circular)).not.toThrow();
    expect(sendMessage).toHaveBeenCalledWith(
      'debug-log',
      expect.objectContaining({ level: 'error', message: 'boom', data: '[unserializable]' }),
    );
  });
});

describe('read-only DOM/layout responder', () => {
  const lastResult = () => {
    const calls = sendMessage.mock.calls.filter((c) => c[0] === 'debug-query-result');
    return calls.length ? (calls[calls.length - 1][1] as Record<string, unknown>) : undefined;
  };

  beforeEach(() => {
    document.body.innerHTML = '<div id="app" class="editor-app"><span role="tab">App.tsx</span></div>';
  });

  it('ignores queries while the gate is closed', () => {
    push('debug-query', { id: 1, method: 'rect', params: { selector: '#app' } });
    expect(lastResult()).toBeUndefined();
  });

  it('answers snapshotDom with a bounded structured tree once enabled', () => {
    mod.isDebugEnabled();
    enable();
    push('debug-query', { id: 7, method: 'snapshotDom', params: { selector: '#app' } });
    const res = lastResult();
    expect(res).toMatchObject({ id: 7, ok: true });
    const tree = res!.result as { tag: string; id?: string; classes?: string[]; children?: unknown[] };
    expect(tree.tag).toBe('div');
    expect(tree.id).toBe('app');
    expect(tree.classes).toContain('editor-app');
    expect(Array.isArray(tree.children)).toBe(true);
  });

  it('rejects an unknown method (read-only vocabulary, no eval)', () => {
    mod.isDebugEnabled();
    enable();
    push('debug-query', { id: 9, method: 'eval', params: { code: 'window.x=1' } });
    const res = lastResult();
    expect(res).toMatchObject({ id: 9, ok: false });
    expect(String(res!.error)).toMatch(/unknown debug method/);
  });
});
