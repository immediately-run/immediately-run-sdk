/**
 * @jest-environment jsdom
 */
import { act, createRef } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { receiveNavigation, resetEntryState, takeQueuedEntryState } from '../entryState';
import { RESTORE_DEADLINE_MS } from '../scrollRestore';
import { TinkerableContext, type TinkerableState } from '../TinkerableContext';
import { ScrollRestoration } from './ScrollRestoration';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const baseCtx = (hash = ''): TinkerableState => ({
  outerHref: 'https://localhost/present/github/acme/blog/main/spec',
  navigationState: {
    mode: 'present',
    provider: 'github',
    namespace: 'acme',
    repository: 'blog',
    ref: 'main',
    sandboxPath: '/spec',
    hash,
    search: '',
  },
  routingSpec: { routes: [] },
  filesMetadata: {},
});

const mount = (ui: ReactNode, ctx: TinkerableState = baseCtx()) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<TinkerableContext value={ctx}>{ui}</TinkerableContext>));
  return { unmount: () => act(() => root.unmount()) };
};

/** A scroller with settable geometry — jsdom has no layout, so the heights that
 *  drive the convergence loop are defined here explicitly. */
const makeScroller = (scrollHeight: number, clientHeight = 700) => {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true });
  let height = scrollHeight;
  Object.defineProperty(el, 'scrollHeight', { get: () => height, configurable: true });
  el.scrollTop = 0;
  document.body.appendChild(el);
  return { el, grow: (to: number) => (height = to) };
};

beforeEach(() => {
  jest.useFakeTimers();
  resetEntryState();
});
afterEach(() => {
  jest.useRealTimers();
  resetEntryState();
  document.body.innerHTML = '';
});

describe('ScrollRestoration (R3-627)', () => {
  it('remembers the container offset for the entry being left', () => {
    const { el } = makeScroller(2400);
    const ref = createRef<HTMLElement>();
    (ref as { current: HTMLElement | null }).current = el;
    el.scrollTop = 640;
    const { unmount } = mount(<ScrollRestoration scroller={ref} />);
    expect(takeQueuedEntryState()).toEqual({ 'ir.scroll': 640 });
    unmount();
  });

  it('remembers nothing at the top of a page, so most entries carry no scratch', () => {
    const { el } = makeScroller(2400);
    const ref = createRef<HTMLElement>();
    (ref as { current: HTMLElement | null }).current = el;
    el.scrollTop = 0;
    const { unmount } = mount(<ScrollRestoration scroller={ref} />);
    expect(takeQueuedEntryState()).toBeUndefined();
    unmount();
  });

  it('stops being asked once unmounted', () => {
    const { el } = makeScroller(2400);
    const ref = createRef<HTMLElement>();
    (ref as { current: HTMLElement | null }).current = el;
    el.scrollTop = 100;
    const { unmount } = mount(<ScrollRestoration scroller={ref} />);
    unmount();
    expect(takeQueuedEntryState()).toBeUndefined();
  });

  it('restores the offset on a back traversal once the content is tall enough', () => {
    const { el, grow } = makeScroller(700); // too short at first: 0px reachable
    const ref = createRef<HTMLElement>();
    (ref as { current: HTMLElement | null }).current = el;
    act(() => receiveNavigation({ state: { 'ir.scroll': 640 }, direction: 'back' }));
    const { unmount } = mount(<ScrollRestoration scroller={ref} />);

    act(() => void jest.advanceTimersByTime(120));
    expect(el.scrollTop).toBe(0); // still too short — must NOT clamp to the top

    grow(2400);
    act(() => void jest.advanceTimersByTime(200));
    expect(el.scrollTop).toBe(640);
    unmount();
  });

  it('does not restore on an ordinary forward navigation', () => {
    const { el } = makeScroller(2400);
    const ref = createRef<HTMLElement>();
    (ref as { current: HTMLElement | null }).current = el;
    act(() => receiveNavigation({ state: { 'ir.scroll': 640 }, direction: 'push' }));
    const { unmount } = mount(<ScrollRestoration scroller={ref} />);
    act(() => void jest.advanceTimersByTime(RESTORE_DEADLINE_MS + 50));
    expect(el.scrollTop).toBe(0);
    unmount();
  });

  it('stands down when the arrival URL carries a fragment', () => {
    const { el } = makeScroller(2400);
    const ref = createRef<HTMLElement>();
    (ref as { current: HTMLElement | null }).current = el;
    act(() => receiveNavigation({ state: { 'ir.scroll': 640 }, direction: 'back' }));
    const { unmount } = mount(<ScrollRestoration scroller={ref} />, baseCtx('section-3'));
    act(() => void jest.advanceTimersByTime(RESTORE_DEADLINE_MS + 50));
    expect(el.scrollTop).toBe(0); // the deep link wins
    unmount();
  });

  it('gives up rather than scrolling a page whose content never grew', () => {
    const { el } = makeScroller(700);
    const ref = createRef<HTMLElement>();
    (ref as { current: HTMLElement | null }).current = el;
    act(() => receiveNavigation({ state: { 'ir.scroll': 640 }, direction: 'back' }));
    const { unmount } = mount(<ScrollRestoration scroller={ref} />);
    act(() => void jest.advanceTimersByTime(RESTORE_DEADLINE_MS + 50));
    expect(el.scrollTop).toBe(0);
    unmount();
  });

  it('abandons the moment the reader scrolls, and leaves them where they are', () => {
    const { el, grow } = makeScroller(700);
    const ref = createRef<HTMLElement>();
    (ref as { current: HTMLElement | null }).current = el;
    act(() => receiveNavigation({ state: { 'ir.scroll': 640 }, direction: 'back' }));
    const { unmount } = mount(<ScrollRestoration scroller={ref} />);

    // The reader starts reading while the content is still filling in.
    el.scrollTop = 120;
    act(() => el.dispatchEvent(new Event('scroll')));
    grow(2400);
    act(() => void jest.advanceTimersByTime(RESTORE_DEADLINE_MS + 50));

    expect(el.scrollTop).toBe(120);
    unmount();
  });
});
