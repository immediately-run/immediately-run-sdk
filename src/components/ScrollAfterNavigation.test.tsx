/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { TinkerableContext, type TinkerableState } from '../TinkerableContext';
import { ScrollAfterNavigation } from './ScrollAfterNavigation';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const baseCtx = (hash: string, sandboxPath = '/spec'): TinkerableState => ({
  outerHref: 'https://localhost/present/github/acme/blog/main/spec',
  navigationState: {
    mode: 'present',
    provider: 'github',
    namespace: 'acme',
    repository: 'blog',
    ref: 'main',
    sandboxPath,
    hash,
    search: '',
  },
  routingSpec: { routes: [] },
  filesMetadata: {},
});

const mount = (ui: ReactNode) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  return { container, unmount: () => act(() => root.unmount()) };
};

describe('ScrollAfterNavigation — Capability C (§13.5)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '';
  });
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('scrolls to a target already in the DOM at mount time (fast path)', () => {
    const h = document.createElement('h2');
    h.id = 'sec-3';
    const spy = jest.fn();
    h.scrollIntoView = spy;
    document.body.appendChild(h);

    const { unmount } = mount(
      <TinkerableContext value={baseCtx('sec-3')}>
        <ScrollAfterNavigation />
      </TinkerableContext>,
    );
    expect(spy).toHaveBeenCalled();
    unmount();
  });

  it('scrolls to a target that mounts LATE (after the route change), via retry', () => {
    const { unmount } = mount(
      <TinkerableContext value={baseCtx('sec-8-9')}>
        <ScrollAfterNavigation />
      </TinkerableContext>,
    );
    // The destination section is not in the DOM yet — nothing to scroll to.
    // Simulate the destination file's tree mounting after navigation.
    const h = document.createElement('h3');
    h.id = 'sec-8-9';
    const spy = jest.fn();
    h.scrollIntoView = spy;
    act(() => {
      document.body.appendChild(h);
      jest.advanceTimersByTime(700); // exhaust the [120,300,600] retry cadence
    });
    expect(spy).toHaveBeenCalled();
    unmount();
  });

  it('does nothing when there is no fragment', () => {
    const h = document.createElement('h2');
    h.id = 'sec-3';
    const spy = jest.fn();
    h.scrollIntoView = spy;
    document.body.appendChild(h);

    const { unmount } = mount(
      <TinkerableContext value={baseCtx('')}>
        <ScrollAfterNavigation />
      </TinkerableContext>,
    );
    act(() => jest.advanceTimersByTime(1000));
    expect(spy).not.toHaveBeenCalled();
    unmount();
  });

  it('falls back to top-of-page when the fragment never resolves (no throw)', () => {
    const scrollSpy = jest.fn();
    (window as unknown as { scrollTo: unknown }).scrollTo = scrollSpy;
    const { unmount } = mount(
      <TinkerableContext value={baseCtx('bogus')}>
        <ScrollAfterNavigation />
      </TinkerableContext>,
    );
    act(() => jest.advanceTimersByTime(1000)); // past the 900ms final fallback
    expect(scrollSpy).toHaveBeenCalledWith(0, 0);
    unmount();
  });
});
