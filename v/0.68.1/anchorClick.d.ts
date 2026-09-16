import { MouseEvent, MouseEventHandler, DependencyList } from 'react';

/**
 * True when the click is the browser's to handle, not ours: a modified click or a
 * non-primary button means "open this somewhere else", and the sandbox permits that
 * (`allow-popups`) even where it forbids moving the top-level window.
 *
 * Intercepting these would take away open-in-new-tab, which is one of the two things
 * (with copy-link) that make an `href` worth rendering at all.
 */
declare const isBrowserGestureClick: (event: MouseEvent<HTMLAnchorElement>) => boolean;
/**
 * Compose a consumer-supplied `onClick` with an interception: the consumer handler runs
 * FIRST, and calling `preventDefault()` in it opts the click out of the interception
 * entirely; otherwise `intercept` runs.
 *
 * `intercept` is re-created on every render, so it is deliberately NOT a dependency:
 * `interceptDeps` names the values it closes over, and the memo is invalidated exactly when
 * those change.
 */
declare const useComposedAnchorClick: (onClick: MouseEventHandler<HTMLAnchorElement> | undefined, intercept: (e: MouseEvent<HTMLAnchorElement>) => void, interceptDeps: DependencyList) => MouseEventHandler<HTMLAnchorElement>;

export { isBrowserGestureClick, useComposedAnchorClick };
