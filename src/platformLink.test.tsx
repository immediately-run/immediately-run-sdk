/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { TinkerableContext } from './TinkerableContext';
import type { NavigationState, TinkerableState } from './TinkerableContext';
import { PlatformLink, usePlatformHref } from './platformLink';
import { constructUrl } from './urlUtils';

// Opt in to React's act(...) testing semantics for this jsdom suite.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const nav: NavigationState = {
  mode: 'present',
  provider: 'github',
  namespace: 'acme',
  repository: 'todo',
  ref: 'main',
  sandboxPath: '/present/github/acme/todo/main',
  hash: '',
  search: '',
};

const outerHref = constructUrl('https://immediately.run', nav);

const render = (ui: React.ReactElement, state?: Partial<TinkerableState>) => {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => {
    root.render(state ? <TinkerableContext value={state as TinkerableState}>{ui}</TinkerableContext> : ui);
  });
  return {
    anchor: () => container.querySelector('a') as HTMLAnchorElement,
    unmount: () => act(() => root.unmount()),
  };
};

describe('usePlatformHref (R3-529)', () => {
  it('inside a context with an outerHref, the href is absolute on the host origin', () => {
    let href = '';
    const Probe = () => {
      href = usePlatformHref()('/home');
      return null;
    };
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(
        <TinkerableContext value={{ outerHref } as TinkerableState}>
          <Probe />
        </TinkerableContext>,
      );
    });
    expect(href).toBe('https://immediately.run/home');
    act(() => root.unmount());
  });

  it('with no context (empty default), the href is the path — vite dev keeps working', () => {
    let href = '';
    const Probe = () => {
      href = usePlatformHref()('/home');
      return null;
    };
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(<Probe />));
    expect(href).toBe('/home');
    act(() => root.unmount());
  });
});

describe('PlatformLink (R3-529)', () => {
  it('renders an anchor whose href is absolute on the host origin and whose target is _top', () => {
    const rendered = render(<PlatformLink path="/home">Home</PlatformLink>, { outerHref });
    const a = rendered.anchor();
    expect(a.getAttribute('href')).toBe('https://immediately.run/home');
    expect(a.getAttribute('target')).toBe('_top');
    expect(a.textContent).toBe('Home');
    rendered.unmount();
  });

  it('carries the rest of the anchor props (class, aria) on the anchor', () => {
    const rendered = render(
      <PlatformLink path="/notifications" className="row-link" aria-label="Notifications">
        Open
      </PlatformLink>,
      { outerHref },
    );
    const a = rendered.anchor();
    expect(a.className).toBe('row-link');
    expect(a.getAttribute('aria-label')).toBe('Notifications');
    rendered.unmount();
  });

  it('with no context, the href is the bare path and target stays _top', () => {
    const rendered = render(<PlatformLink path="/home">Home</PlatformLink>);
    expect(rendered.anchor().getAttribute('href')).toBe('/home');
    expect(rendered.anchor().getAttribute('target')).toBe('_top');
    rendered.unmount();
  });
});
