/**
 * @jest-environment jsdom
 */
// The wrapper's `data-theme` must follow the host theme push, not just read it once: the
// dark-polarity tokens key on it. Driven through the real theme channel with only the
// transport replaced, the pattern `spacesMode.hook.test.tsx` uses.
import { THEME } from '../generated/protocol';

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
});

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
