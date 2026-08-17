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

import { navigate } from '../routing';
import { TinkerableContext, type TinkerableState } from '../TinkerableContext';
import { parseHref } from '../urlUtils';
import { InternalLink, Link } from './Link';

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
    expect(navigate).toHaveBeenCalledWith(
      'https://host.example/edit/github/a/b/main/files/premise.mdx',
    );
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
        <Link
          href="https://local.immediately.run/edit/github/neumark/book/main/files/premise.mdx"
          onClick={onClose}
        >
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
