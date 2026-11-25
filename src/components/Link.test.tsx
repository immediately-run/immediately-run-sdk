/**
 * @jest-environment jsdom
 */
// InternalLink click contract — the drawer-reload regression.
//
// `InternalLink` used to spread `...props` AFTER `onClick={clickHandler}`, so a
// consumer-supplied `onClick` (grove's nav drawer passes `onClick={onClose}`)
// silently REPLACED the router interception. The anchor's default action then
// navigated the sandboxed iframe itself to the host URL — reloading the running
// app and framing the whole host inside its own sandbox. These tests pin the
// composed contract: consumer onClick runs first, `preventDefault()` opts out,
// plain clicks route via navigate(), and open-in-new-tab gestures stay native.
import { act } from 'react';
import { createRoot } from 'react-dom/client';

jest.mock('../routing', () => ({ navigate: jest.fn() }));
jest.mock('../scrollToId', () => ({ scrollToId: jest.fn(() => true) }));

import { navigate } from '../routing';
import { scrollToId } from '../scrollToId';
import { TinkerableContext, type TinkerableState } from '../TinkerableContext';
import { parseHref } from '../urlUtils';
import { FragmentLink, InternalLink, Link } from './Link';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const render = (ui: React.ReactNode) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  return {
    container,
    anchor: () => container.querySelector('a') as HTMLAnchorElement,
    unmount: () =>
      act(() => {
        root.unmount();
        container.remove();
      }),
  };
};

const click = (el: HTMLElement, init?: MouseEventInit): MouseEvent => {
  const ev = new MouseEvent('click', { bubbles: true, cancelable: true, ...init });
  act(() => {
    el.dispatchEvent(ev);
  });
  return ev;
};

beforeEach(() => {
  (navigate as jest.Mock).mockClear();
  (scrollToId as jest.Mock).mockClear();
});

describe('InternalLink — consumer onClick composes with the router interception', () => {
  it('REGRESSION: a consumer onClick does not replace the interception', () => {
    const onClick = jest.fn();
    const r = render(
      <InternalLink href="https://host.example/edit/github/a/b/main/files/premise.mdx" onClick={onClick}>
        Premise
      </InternalLink>,
    );
    const ev = click(r.anchor());
    expect(onClick).toHaveBeenCalledTimes(1);
    // The interception still ran: default prevented (no iframe navigation), routed.
    expect(ev.defaultPrevented).toBe(true);
    expect(navigate).toHaveBeenCalledWith('https://host.example/edit/github/a/b/main/files/premise.mdx');
    r.unmount();
  });

  it('a consumer that calls preventDefault() opts out of routing', () => {
    const r = render(
      <InternalLink href="https://host.example/x" onClick={(e) => e.preventDefault()}>
        x
      </InternalLink>,
    );
    click(r.anchor());
    expect(navigate).not.toHaveBeenCalled();
    r.unmount();
  });

  it.each([
    ['metaKey', { metaKey: true }],
    ['ctrlKey', { ctrlKey: true }],
    ['shiftKey', { shiftKey: true }],
    ['altKey', { altKey: true }],
    ['middle button', { button: 1 }],
  ] as const)('an open-in-new-tab gesture (%s) keeps the browser default', (_label, init) => {
    const r = render(<InternalLink href="https://host.example/x">x</InternalLink>);
    const ev = click(r.anchor(), init);
    expect(navigate).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
    r.unmount();
  });

  it('an explicit non-self target keeps the browser default', () => {
    const r = render(
      <InternalLink href="https://host.example/x" target="_blank">
        x
      </InternalLink>,
    );
    const ev = click(r.anchor());
    expect(navigate).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
    r.unmount();
  });
});

// FragmentLink is the OTHER implementation of the same composed-click contract
// (`useComposedAnchorClick`). It was the untested half: the InternalLink
// regression above is what a divergence between the two looks like, so both
// halves are pinned here.
describe('FragmentLink — consumer onClick composes with the scroll interception', () => {
  it('a consumer onClick does not replace the interception', () => {
    const onClick = jest.fn();
    const r = render(
      <FragmentLink href="#sec-8-9" onClick={onClick}>
        8.9
      </FragmentLink>,
    );
    const ev = click(r.anchor());
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(ev.defaultPrevented).toBe(true);
    expect(scrollToId).toHaveBeenCalledWith('sec-8-9');
    r.unmount();
  });

  it('a consumer that calls preventDefault() opts out of scrolling', () => {
    const r = render(
      <FragmentLink href="#sec-8-9" onClick={(e) => e.preventDefault()}>
        8.9
      </FragmentLink>,
    );
    click(r.anchor());
    expect(scrollToId).not.toHaveBeenCalled();
    r.unmount();
  });

  it('a non-fragment href keeps the browser default', () => {
    const onClick = jest.fn();
    const r = render(
      <FragmentLink href="/elsewhere" onClick={onClick}>
        x
      </FragmentLink>,
    );
    const ev = click(r.anchor());
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(ev.defaultPrevented).toBe(false);
    expect(scrollToId).not.toHaveBeenCalled();
    r.unmount();
  });
});

describe('Link — the drawer-shaped case end to end', () => {
  it('an absolute same-repo href with a consumer onClick routes without a page load', () => {
    // The grove drawer: outerHref is the dispatched corpus route; each nav item is
    // an ABSOLUTE host URL under the same repo prefix, with onClick={closeDrawer}.
    const outerHref = 'https://local.immediately.run/edit/github/neumark/book/main/';
    const state = {
      outerHref,
      navigationState: parseHref(outerHref),
    } as TinkerableState;
    const onClose = jest.fn();
    const r = render(
      <TinkerableContext value={state}>
        <Link href="https://local.immediately.run/edit/github/neumark/book/main/files/premise.mdx" onClick={onClose}>
          Premise
        </Link>
      </TinkerableContext>,
    );
    const ev = click(r.anchor());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(ev.defaultPrevented).toBe(true);
    expect(navigate).toHaveBeenCalledTimes(1);
    r.unmount();
  });
});

// R3-1397 — inside a bundle the host sends `filesHrefBase`; the rendered href is the
// bundle's own address while a plain click still routes the app-space URL (which is
// what the host maps). The outer state is `parseHref` of a host-shaped URL.
describe('Link inside a bundle (R3-1397)', () => {
  const PREFIX = 'https://immediately.run/present/github/immediately-run/baton/main/';
  const BASE = `${PREFIX}bundle/tickets/`;
  const stateAt = (filesHrefBase: string | null) => {
    const outerHref = `${PREFIX}files/B-10.md`;
    return { outerHref, navigationState: parseHref(outerHref), filesHrefBase } as TinkerableState;
  };

  it('renders the bundle address and routes the app-space URL on click', () => {
    const r = render(
      <TinkerableContext value={stateAt(BASE)}>
        <Link href="B-11.md#r-2">B-11</Link>
      </TinkerableContext>,
    );
    expect(r.anchor().getAttribute('href')).toBe(`${BASE}B-11.md#r-2`);
    click(r.anchor());
    expect(navigate).toHaveBeenCalledWith(`${PREFIX}files/B-11.md#r-2`);
    r.unmount();
  });

  it('without a base, href and click are the app-space URL, as before', () => {
    const r = render(
      <TinkerableContext value={stateAt(null)}>
        <Link href="B-11.md">B-11</Link>
      </TinkerableContext>,
    );
    expect(r.anchor().getAttribute('href')).toBe(`${PREFIX}files/B-11.md`);
    click(r.anchor());
    expect(navigate).toHaveBeenCalledWith(`${PREFIX}files/B-11.md`);
    r.unmount();
  });

  it('an external link is untouched by the base', () => {
    const r = render(
      <TinkerableContext value={stateAt(BASE)}>
        <Link href="https://example.com/files/x">x</Link>
      </TinkerableContext>,
    );
    expect(r.anchor().getAttribute('href')).toBe('https://example.com/files/x');
    r.unmount();
  });

  it('InternalLink never forwards navigateHref to the DOM', () => {
    const r = render(
      <InternalLink href={`${BASE}B-11.md`} navigateHref={`${PREFIX}files/B-11.md`}>
        x
      </InternalLink>,
    );
    expect(r.anchor().hasAttribute('navigatehref')).toBe(false);
    expect(r.anchor().getAttribute('href')).toBe(`${BASE}B-11.md`);
    r.unmount();
  });
});
