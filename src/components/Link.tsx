import { ReactNode, use } from 'react';
import { isBrowserGestureClick, useComposedAnchorClick } from '../anchorClick';
import { navigate } from '../routing';
import { scrollToId } from '../scrollToId';
import { TinkerableContext } from '../TinkerableContext';
import { constructOuterUrl, isInternalHref } from '../urlUtils';

/** A same-page anchor (`#frag`): scrolls the addressed section into view on click
 *  **without a route change** (MARKDOWN_SYNTAX_SPEC §13.5). The default behavior of a
 *  bare `#`-href is intercepted so the sandbox URL the host owns is never mutated
 *  out from under it; a fragment that names nothing leaves the scroll position
 *  untouched (a soft failure). */
export const FragmentLink = ({
  href,
  children,
  onClick,
  ...props
}: React.DetailedHTMLProps<React.AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>): ReactNode => {
  const clickHandler = useComposedAnchorClick(
    onClick,
    (e) => {
      if (href && href.startsWith('#')) {
        e.preventDefault();
        scrollToId(href.slice(1));
      }
    },
    [href],
  );
  return (
    <a href={href} onClick={clickHandler} {...props}>
      {children}
    </a>
  );
};

/** An `<a>` that performs in-sandbox navigation on click (prevents the default
 *  full-page load and routes via {@link navigate}).
 *
 *  A consumer-supplied `onClick` is COMPOSED with the router interception, never
 *  substituted for it (`useComposedAnchorClick`, `../anchorClick`): it runs first, and
 *  calling `preventDefault()` opts out of routing. Regression guard: `...props`
 *  used to spread AFTER `onClick={clickHandler}`, so a consumer `onClick` (e.g. a
 *  drawer's close-on-navigate) silently REPLACED the interception — the default
 *  anchor action then navigated the sandboxed iframe itself to the host URL,
 *  reloading the whole app (and framing the host inside its own sandbox).
 *
 *  Modifier/middle clicks and explicit non-self `target`s keep the browser
 *  default: the rendered href is a real host URL, so open-in-new-tab works. */
export const InternalLink = ({
  href,
  children,
  onClick,
  target,
  ...props
}: React.DetailedHTMLProps<React.AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>): ReactNode => {
  const clickHandler = useComposedAnchorClick(
    onClick,
    (e) => {
      if (!href) return;
      // Open-in-new-tab gestures (and an explicit target) are the browser's.
      if (isBrowserGestureClick(e)) return;
      if (target && target !== '_self') return;
      e.preventDefault();
      navigate(href);
    },
    [href, target],
  );
  // Spread FIRST so no forwarded prop can clobber the interception or the href.
  return (
    <a {...props} href={href} target={target} onClick={clickHandler}>
      {children}
    </a>
  );
};

/** A link that routes same-app hrefs through the sandbox router (as an
 *  {@link InternalLink}) and renders external hrefs as a plain `<a>`. */
export const Link = ({
  href,
  children,
  ...properties
}: React.DetailedHTMLProps<React.AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>): ReactNode => {
  const { outerHref, navigationState } = use(TinkerableContext);
  // A pure same-page fragment (`#sec-8-9`) scrolls in place — no route change (§13.5).
  if (href && href.startsWith('#')) {
    return (
      <FragmentLink href={href} {...properties}>
        {children}
      </FragmentLink>
    );
  }
  if (href && isInternalHref(outerHref, href, navigationState)) {
    const targetHref = constructOuterUrl(outerHref, href, navigationState);
    return (
      <InternalLink href={targetHref} {...properties}>
        {children}
      </InternalLink>
    );
  } else {
    // create a regular link to external resource
    return <a {...{ href, ...properties }}>{children}</a>;
  }
};
