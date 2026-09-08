/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { TinkerableContext } from './TinkerableContext';
import type { NavigationState, TinkerableState } from './TinkerableContext';
import { PlatformLink, usePlatformHref } from './platformLink';
import { constructUrl } from './urlUtils';

// The wire is the thing under test, so the transport is the seam that is doubled — not
// `navigate` itself, which would make the assertions circular. `routing` reaches the
// transport through `sandboxUtils`, which re-exports these bindings, so mocking here
// catches it.
const sent: Array<{ type: string; data: Record<string, unknown> }> = [];
jest.mock('./hostTransport', () => ({
  sendMessage: (type: string, data: Record<string, unknown>) => {
    sent.push({ type, data });
  },
  addListener: () => () => {},
}));

beforeEach(() => {
  sent.length = 0;
});

// Opt in to React's act(...) testing semantics for this jsdom suite.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const nav: NavigationState = {
  mode: 'present',
  provider: 'github',
  namespace: 'acme',
  repository: 'todo',
  ref: 'main',
  sandboxPath: '',
  hash: '',
  search: '',
};

// The producer feeds the consumer: the outer href a host would hold at the app root is what
// constructUrl builds from this state — exactly, so a drift in either module fails here.
const outerHref = constructUrl('https://immediately.run', nav);

const render = (ui: React.ReactElement, state?: Partial<TinkerableState>) => {
  const container = document.createElement('div');
  // In the document, because React attaches its listener at the root container and these
  // tests dispatch real click events through it.
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(state ? <TinkerableContext value={state as TinkerableState}>{ui}</TinkerableContext> : ui);
  });
  return {
    anchor: () => container.querySelector('a') as HTMLAnchorElement,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
};

/** Dispatch a click the way a browser would, so React's own handler runs. */
const click = (a: HTMLAnchorElement, init: MouseEventInit = {}) => {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init });
  act(() => {
    a.dispatchEvent(event);
  });
  return event;
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

describe('PlatformLink asks the HOST to navigate (R3-568)', () => {
  it('a plain left-click asks the host to navigate to the absolute host URL, and cancels the anchor', () => {
    const rendered = render(<PlatformLink path="/home">Home</PlatformLink>, { outerHref });
    const event = click(rendered.anchor());

    // The anchor's own navigation is cancelled: `target="_top"` is what the sandbox refuses,
    // so leaving it to the browser is the bug this fixes.
    expect(event.defaultPrevented).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].type).toBe('urlchange');
    expect(sent[0].data).toMatchObject({ url: 'https://immediately.run/home', back: false, forward: false });
    rendered.unmount();
  });

  it('sends the SAME url the anchor advertises, so copy-link and click cannot disagree', () => {
    const rendered = render(<PlatformLink path="/present/github/acme/todo">Open</PlatformLink>, { outerHref });
    const a = rendered.anchor();
    const href = a.getAttribute('href');
    click(a);
    expect(sent).toHaveLength(1);
    expect(sent[0].data.url).toBe(href);
    rendered.unmount();
  });

  it.each([
    ['metaKey', { metaKey: true }],
    ['ctrlKey', { ctrlKey: true }],
    ['shiftKey', { shiftKey: true }],
    ['altKey', { altKey: true }],
    ['a non-primary button', { button: 1 }],
  ])('leaves %s to the browser — that gesture means "open it somewhere else"', (_label, init) => {
    const rendered = render(<PlatformLink path="/home">Home</PlatformLink>, { outerHref });
    const event = click(rendered.anchor(), init as MouseEventInit);
    expect(event.defaultPrevented).toBe(false);
    expect(sent).toEqual([]);
    rendered.unmount();
  });

  it('with no host (vite dev) it neither cancels nor sends — the anchor href is right there', () => {
    const rendered = render(<PlatformLink path="/home">Home</PlatformLink>);
    const event = click(rendered.anchor());
    expect(event.defaultPrevented).toBe(false);
    expect(sent).toEqual([]);
    rendered.unmount();
  });

  it("a caller's onClick runs, and its preventDefault wins — the caller owns the outcome", () => {
    const rendered = render(
      <PlatformLink path="/home" onClick={(e) => e.preventDefault()}>
        Home
      </PlatformLink>,
      { outerHref },
    );
    click(rendered.anchor());
    expect(sent).toEqual([]);
    rendered.unmount();
  });

  it("a caller's onClick that does NOT cancel still gets the host navigation", () => {
    const seen: string[] = [];
    const rendered = render(
      <PlatformLink path="/home" onClick={() => seen.push('called')}>
        Home
      </PlatformLink>,
      { outerHref },
    );
    click(rendered.anchor());
    expect(seen).toEqual(['called']);
    expect(sent).toHaveLength(1);
    rendered.unmount();
  });
});
