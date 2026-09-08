/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { isBrowserGestureClick, useComposedAnchorClick } from './anchorClick';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A React-shaped mouse event, only as far as these two functions read it. */
const evt = (over: Partial<ReactMouseEvent<HTMLAnchorElement>> = {}) =>
  ({
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    button: 0,
    ...over,
  } as ReactMouseEvent<HTMLAnchorElement>);

describe('isBrowserGestureClick', () => {
  it('is false for a plain primary click — the one case we intercept', () => {
    expect(isBrowserGestureClick(evt())).toBe(false);
  });

  // The whole point of the predicate is that EVERY member of this class is left alone;
  // a modifier that slipped out of the disjunction would silently steal open-in-new-tab.
  it.each([
    ['metaKey', { metaKey: true }],
    ['ctrlKey', { ctrlKey: true }],
    ['shiftKey', { shiftKey: true }],
    ['altKey', { altKey: true }],
    ['the middle button', { button: 1 }],
    ['the right button', { button: 2 }],
  ])('is true for %s', (_label, over) => {
    expect(isBrowserGestureClick(evt(over))).toBe(true);
  });
});

describe('useComposedAnchorClick', () => {
  const render = (handler: (el: HTMLAnchorElement) => void) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    return { container, root, handler };
  };

  const mount = (
    onClick: ((e: ReactMouseEvent<HTMLAnchorElement>) => void) | undefined,
    intercept: (e: ReactMouseEvent<HTMLAnchorElement>) => void,
  ) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const Probe = () => {
      const composed = useComposedAnchorClick(onClick, intercept, []);
      return <a href="/x" onClick={composed} />;
    };
    act(() => root.render(<Probe />));
    const anchor = container.querySelector('a') as HTMLAnchorElement;
    return {
      click: () => {
        const e = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
        act(() => {
          anchor.dispatchEvent(e);
        });
        return e;
      },
      unmount: () => {
        act(() => root.unmount());
        container.remove();
      },
    };
  };

  it('runs the consumer handler BEFORE the interception', () => {
    const order: string[] = [];
    const h = mount(
      () => order.push('consumer'),
      () => order.push('intercept'),
    );
    h.click();
    expect(order).toEqual(['consumer', 'intercept']);
    h.unmount();
  });

  it("a consumer's preventDefault opts the click out of the interception entirely", () => {
    const order: string[] = [];
    const h = mount(
      (e) => {
        order.push('consumer');
        e.preventDefault();
      },
      () => order.push('intercept'),
    );
    h.click();
    expect(order).toEqual(['consumer']);
    h.unmount();
  });

  it('intercepts when there is no consumer handler at all', () => {
    const order: string[] = [];
    const h = mount(undefined, () => order.push('intercept'));
    h.click();
    expect(order).toEqual(['intercept']);
    h.unmount();
  });

  it('does not swallow the event — the interception decides whether to cancel', () => {
    const h = mount(undefined, (e) => e.preventDefault());
    expect(h.click().defaultPrevented).toBe(true);
    h.unmount();
  });

  it('leaves the event uncancelled when the interception declines', () => {
    const h = mount(undefined, () => {});
    expect(h.click().defaultPrevented).toBe(false);
    h.unmount();
  });

  it('calls the CURRENT intercept, not the one captured on first render', () => {
    // `intercept` is re-created every render and deliberately excluded from the deps, so a
    // stale closure here would be invisible until a value it reads changed. Prove the memo
    // does not pin the first one.
    const seen: string[] = [];
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const Probe = ({ tag }: { tag: string }) => {
      const composed = useComposedAnchorClick(undefined, () => seen.push(tag), [tag]);
      return <a href="/x" onClick={composed} />;
    };
    act(() => root.render(<Probe tag="first" />));
    act(() => root.render(<Probe tag="second" />));
    const anchor = container.querySelector('a') as HTMLAnchorElement;
    act(() => {
      anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
    expect(seen).toEqual(['second']);
    act(() => root.unmount());
    container.remove();
  });
});
