import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';
import { use } from 'react';

import { navigate } from './routing';
import { TinkerableContext } from './TinkerableContext';
import { platformHref } from './urlUtils';

/**
 * Build a PLATFORM-space href (`/present/…`, `/edit/github/…`, `/home`) in the host's URL
 * space, reading `outerHref` from {@link TinkerableContext} the way `useTinkerableLink` does.
 * The returned closure is fresh each render (its output is pure, so identity churn is
 * harmless); an empty context (no host, `vite dev`) yields the path unchanged.
 *
 * Render the result through {@link PlatformLink}, which also asks the HOST to navigate —
 * see that component for why the anchor alone is not enough.
 */
export const usePlatformHref = (): ((path: string) => string) => {
  const { outerHref } = use(TinkerableContext);
  return (path: string) => platformHref(outerHref, path);
};

export interface PlatformLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  /** A root-relative platform path, e.g. `/present/github/acme/todo`. */
  path: string;
  children?: ReactNode;
}

/**
 * The ONE way to render an anchor to a PLATFORM route.
 *
 * It builds the href with {@link platformHref} (resolving against the host's outer origin)
 * and, on a plain left-click, asks the HOST to perform the navigation.
 *
 * **Why the anchor alone does not work (R3-568).** Until R3-568 this component relied solely
 * on `target="_top"`. The app frame's sandbox omits `allow-top-navigation-by-user-activation`
 * deliberately — an app that can move the top-level window on its own schedule is a phishing
 * primitive — so the browser refuses outright and logs *"Unsafe attempt to initiate
 * navigation…"*. Every platform link in every app was inert on the host: measured on
 * production, no Open, no Fork, no Run, and no way to sign in.
 *
 * The host is therefore the only thing that can perform this navigation, and it is asked the
 * same way in-app routing asks — {@link navigate}. The host decides: it accepts a target
 * outside the app's own path prefix only when the target is same-origin, is a recognised
 * platform route, and the HOST's own `navigator.userActivation` says a person just acted.
 * Nothing the app asserts substitutes for that gesture, and a refusal is the host's to report.
 *
 * **The `href` and `target` stay.** They are what make copy-link, middle-click and
 * open-in-new-tab produce something that resolves for another reader — gestures the sandbox
 * does allow (`allow-popups`), which the handler below deliberately declines to intercept.
 * The href is also the correct behaviour with no host at all (`vite dev`), where there is
 * nobody to ask.
 *
 * External URLs (`https://…`) are not platform routes and should stay plain
 * `<a target="_blank">` anchors.
 */
export function PlatformLink({ path, children, onClick, ...rest }: PlatformLinkProps) {
  const { outerHref } = use(TinkerableContext);
  const href = platformHref(outerHref, path);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    // A caller that cancelled the event owns the outcome.
    if (event.defaultPrevented) return;
    // A modified or non-primary click means "open this somewhere else". The sandbox permits
    // that (`allow-popups`), so let the browser do it rather than moving the top level.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    // No host (`vite dev`): there is nobody to ask, and the anchor's own href is right.
    if (!outerHref) return;
    event.preventDefault();
    navigate(href);
  };

  return (
    <a {...rest} href={href} target="_top" onClick={handleClick}>
      {children}
    </a>
  );
}
