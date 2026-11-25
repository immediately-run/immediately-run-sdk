/**
 * @jest-environment jsdom
 */
// The wrapper's `data-theme` must follow the host theme push, not just read it once: the
// dark-polarity tokens key on it. Driven through the real theme channel with only the
// transport replaced, the pattern `spacesMode.hook.test.tsx` uses.
import { TextEncoder as NodeTextEncoder } from 'node:util';

import { THEME } from '../generated/protocol';

// jsdom has no TextEncoder; the token parser sizes files with it, as a browser does.
if (typeof (globalThis as { TextEncoder?: unknown }).TextEncoder === 'undefined') {
  (globalThis as { TextEncoder?: unknown }).TextEncoder = NodeTextEncoder;
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Listener = (msg: Record<string, unknown>) => void;
const listeners: Record<string, Listener[]> = {};

jest.mock('../hostTransport', () => ({
  sendMessage: jest.fn(),
  addListener: (type: string, h: Listener) => {
    (listeners[type] ||= []).push(h);
    return () => {
      listeners[type] = (listeners[type] || []).filter((x) => x !== h);
    };
  },
}));
jest.mock('../sandboxUtils', () => ({ protocolRequest: jest.fn() }));

// The app's working tree, in memory: repo-relative path → text. `onChange` is driven by
// `changeFs` exactly as the host's working-tree push would reach `openAppFs().onChange`.
const files: Record<string, string> = {};
const fsListeners = new Set<(paths: string[]) => void>();
const notFound = () => Object.assign(new Error('not found'), { code: 'not-found' });
jest.mock('../fs', () => ({
  openAppFs: () => ({
    stat: async (path: string) => {
      if (!(path in files)) throw notFound();
      return { kind: 'file', size: new TextEncoder().encode(files[path]).length };
    },
    readFile: async (path: string) => {
      if (!(path in files)) throw notFound();
      return files[path];
    },
    onChange: (cb: (paths: string[]) => void) => {
      fsListeners.add(cb);
      return () => fsListeners.delete(cb);
    },
  }),
}));

// `jest.resetModules()` gives the channel a fresh React, so React and the renderer are
// re-required from the same registry (see spacesMode.hook.test.tsx).
let act: typeof import('react').act;
let createRoot: typeof import('react-dom/client').createRoot;
let Prose: typeof import('./Prose').Prose;
let styles: typeof import('../proseStyles');

const push = (theme: 'light' | 'dark') =>
  act(() => {
    (listeners[THEME] || []).forEach((l) => l({ theme, themeKey: 'immediately-run-default', modeId: theme }));
  });

beforeEach(() => {
  jest.resetModules();
  for (const k of Object.keys(listeners)) delete listeners[k];
  act = require('react').act;
  createRoot = require('react-dom/client').createRoot;
  Prose = require('./Prose').Prose;
  styles = require('../proseStyles');
  document.head.innerHTML = '';
  for (const k of Object.keys(files)) delete files[k];
  fsListeners.clear();
});

/** Let the token reads (in-memory, so done within one macrotask) settle inside act. */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

const changeFs = async (path: string, text: string) => {
  files[path] = text;
  act(() => fsListeners.forEach((l) => l([path])));
  await settle();
};

const mount = (node: React.ReactNode) => {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(node));
  return { container, unmount: () => act(() => root.unmount()) };
};

describe('Prose', () => {
  it('renders an article with the prose class and injects the stylesheet', () => {
    const { container, unmount } = mount(
      <Prose className="extra">
        <h1>Title</h1>
      </Prose>,
    );
    const article = container.querySelector('article')!;
    expect(article.className).toBe(`${styles.PROSE_CLASS} extra`);
    expect(article.querySelector('h1')?.textContent).toBe('Title');
    expect(document.getElementById(styles.PROSE_STYLE_ID)).not.toBeNull();
    unmount();
  });

  it('starts dark (the SDK default) and follows a host theme push both ways', () => {
    const { container, unmount } = mount(<Prose />);
    const article = () => container.querySelector('article')!;
    expect(article().dataset.theme).toBe('dark');
    push('light');
    expect(article().dataset.theme).toBe('light');
    push('dark');
    expect(article().dataset.theme).toBe('dark');
    unmount();
  });

  it('two mounted wrappers share one stylesheet', () => {
    const a = mount(<Prose />);
    const b = mount(<Prose />);
    expect(document.querySelectorAll(`#${styles.PROSE_STYLE_ID}`)).toHaveLength(1);
    a.unmount();
    b.unmount();
  });
});

describe('Prose author tokens', () => {
  const TOKENS = `:root { --accent: #b5482a; }
:root[data-theme="light"] { --ink: #222; }
:root[data-theme="dark"] { --ink: #eee; }`;

  it("applies each wrapper its own directory's tokens, as properties, never as a stylesheet", async () => {
    files['guide/immediately.run.css'] = TOKENS;
    files['notes/immediately.run.css'] = ':root { --accent: green; }';
    const a = mount(<Prose filename="guide/intro.md" />);
    const b = mount(<Prose filename="notes/todo.md" />);
    await settle();
    const elA = a.container.querySelector('article')!;
    const elB = b.container.querySelector('article')!;
    expect(elA.style.getPropertyValue('--accent')).toBe('#b5482a');
    expect(elA.style.getPropertyValue('--ink')).toBe('#eee');
    expect(elB.style.getPropertyValue('--accent')).toBe('green');
    expect(elB.style.getPropertyValue('--ink')).toBe('');
    expect(document.querySelectorAll('style')).toHaveLength(1);
    a.unmount();
    b.unmount();
  });

  it('clears every property it set on unmount', async () => {
    files['immediately.run.css'] = TOKENS;
    let seen: HTMLElement | null = null;
    const m = mount(<Prose filename="README.md" ref={(el) => void (el && (seen = el))} />);
    await settle();
    expect(seen).toBe(m.container.querySelector('article'));
    const el = seen as unknown as HTMLElement;
    expect(el.style.length).toBe(2);
    m.unmount();
    expect(el.style.length).toBe(0);
  });

  it('re-applies the other polarity on a theme push', async () => {
    files['immediately.run.css'] = TOKENS;
    const { container, unmount } = mount(<Prose filename="README.md" />);
    await settle();
    const el = container.querySelector('article')!;
    expect(el.style.getPropertyValue('--ink')).toBe('#eee');
    push('light');
    expect(el.style.getPropertyValue('--ink')).toBe('#222');
    expect(el.style.getPropertyValue('--accent')).toBe('#b5482a');
    unmount();
  });

  it('re-reads on a change to the token file, and drops a token removed from it', async () => {
    files['immediately.run.css'] = TOKENS;
    const { container, unmount } = mount(<Prose filename="docs/a.md" />);
    await settle();
    const el = container.querySelector('article')!;
    await changeFs('immediately.run.css', ':root { --accent: purple; }');
    expect(el.style.getPropertyValue('--accent')).toBe('purple');
    expect(el.style.getPropertyValue('--ink')).toBe('');
    unmount();
  });

  it('picks up a marker created on the walked path', async () => {
    files['immediately.run.css'] = TOKENS;
    files['alt.css'] = ':root { --accent: teal; }';
    const { container, unmount } = mount(<Prose filename="README.md" />);
    await settle();
    await changeFs('immediately.run.json', JSON.stringify({ styles: 'alt.css' }));
    expect(container.querySelector('article')!.style.getPropertyValue('--accent')).toBe('teal');
    unmount();
  });

  it('warns once naming the file and renders with the defaults when the file is refused', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    files['immediately.run.css'] = 'h2 { --accent: red; }';
    const { container, unmount } = mount(<Prose filename="README.md" />);
    await settle();
    expect(container.querySelector('article')!.style.length).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('immediately.run.css');
    warn.mockRestore();
    unmount();
  });

  it('reads nothing without a filename', async () => {
    files['immediately.run.css'] = TOKENS;
    const { container, unmount } = mount(<Prose />);
    await settle();
    expect(container.querySelector('article')!.style.length).toBe(0);
    expect(fsListeners.size).toBe(0);
    unmount();
  });
});
