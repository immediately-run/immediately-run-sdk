// The click contract the link primitives share (`components/Link.tsx`, `platformLink.tsx`).
//
// Both spelled this out inline until it became one named contract, which is how they
// drifted apart once already; R3-568 added a third spelling in `PlatformLink` and drifted
// again (it ignored a caller-supplied `target`), so the contract and its guard now live in
// one module that every primitive imports.
import { useCallback } from 'react';
import type { DependencyList, MouseEvent, MouseEventHandler } from 'react';

/**
 * True when the click is the browser's to handle, not ours: a modified click or a
 * non-primary button means "open this somewhere else", and the sandbox permits that
 * (`allow-popups`) even where it forbids moving the top-level window.
 *
 * Intercepting these would take away open-in-new-tab, which is one of the two things
 * (with copy-link) that make an `href` worth rendering at all.
 */
export const isBrowserGestureClick = (event: MouseEvent<HTMLAnchorElement>): boolean =>
  event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;

/**
 * Compose a consumer-supplied `onClick` with an interception: the consumer handler runs
 * FIRST, and calling `preventDefault()` in it opts the click out of the interception
 * entirely; otherwise `intercept` runs.
 *
 * `intercept` is re-created on every render, so it is deliberately NOT a dependency:
 * `interceptDeps` names the values it closes over, and the memo is invalidated exactly when
 * those change.
 */
export const useComposedAnchorClick = (
  onClick: MouseEventHandler<HTMLAnchorElement> | undefined,
  intercept: (e: MouseEvent<HTMLAnchorElement>) => void,
  interceptDeps: DependencyList,
): MouseEventHandler<HTMLAnchorElement> =>
  useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(e);
      if (e.defaultPrevented) return;
      intercept(e);
    },
    [onClick, ...interceptDeps],
  );
