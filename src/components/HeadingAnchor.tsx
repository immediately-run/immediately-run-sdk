import { ReactNode, use, useCallback } from 'react';
import { scrollToId } from '../scrollToId';
import { TinkerableContext } from '../TinkerableContext';
import { constructOuterUrl } from '../urlUtils';
import { FragmentLink } from './Link';

/**
 * Default MDX `HeadingAnchor` component — the render target for the autolink anchor
 * the transpiler's heading-slug plugin (R3-186, `MARKDOWN_SYNTAX_SPEC §15.4`)
 * prepends to every heading. That plugin sets the heading's own `id` (a text slug,
 * or a `sec-…` section id for a numbered heading, R3-211) and emits
 * `<HeadingAnchor id="<that id>" />` as the heading's first child.
 *
 * It is registered in {@link DEFAULT_MDX_COMPONENTS} so a heading anchor renders
 * even in a plain-markdown repo that never calls `boot({ mdxComponents })` — the
 * MDX missing-reference guard never fires (§11.2 phantom defaults). The markup is
 * semantic and accessible — an `aria`-labelled `<a href="#id">` permalink — but
 * **styling is intentionally minimal** (`§15.4` honesty note): an app supplies CSS
 * targeting the `ir-heading-anchor` class to reveal it on hover / add an icon, or
 * overrides this component via `boot({ mdxComponents: { HeadingAnchor } })` to
 * change the icon, position, or behaviour (e.g. copy-permalink-to-clipboard) of
 * every heading anchor in every content file at once (§15.4 late binding).
 *
 * `id` is the *heading's own* id, so the permalink `#id` is the same URL a reader
 * copies and (for a `sec-…` id) an agent computes from a `§`-citation with zero
 * lookup. A missing/empty `id` (defensive — the plugin always supplies one)
 * renders nothing rather than a dead `#` link.
 */
export const HeadingAnchor = ({
  id,
  ...rest
}: {
  id?: string;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>): ReactNode => {
  // ⚠ A BARE `#id` IS THE WRONG HREF INSIDE A SANDBOXED APP, and wrong in a way that only
  // shows up when someone copies the link. The app runs in an iframe whose document URL is
  // the SANDBOX's (`https://sandbox.immediately.run/index.html?href=…`), so the browser
  // resolves `#id` against THAT — "copy link address" on a heading yields a
  // sandbox-internal URL that means nothing to anyone else. Reported from a real wiki
  // (2026-08-14) as exactly that URL instead of the entry's.
  //
  // Both halves have to be right, and they pull in opposite directions:
  //   • the HREF must be absolute in the HOST's space, so copy-link / middle-click /
  //     open-in-new-tab all produce a URL that resolves for a reader;
  //   • the CLICK must NOT navigate to it — that would be a full page load to the page you
  //     are already on. It scrolls, leaving the sandbox URL the host owns untouched.
  //
  // `FragmentLink` is the SDK's existing home for the second half; it runs the caller's
  // `onClick` first and stands down if it preventDefaults, which is what lets the href be
  // absolute here while the behaviour stays a scroll.
  const ctx = use(TinkerableContext);
  const onAnchorClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      // Let a modified click through: cmd/ctrl/middle-click means "open the permalink",
      // and that is precisely the case the absolute href exists to serve.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      if (id) scrollToId(id);
    },
    [id],
  );
  if (!id) return null;
  // No context (a plain-markdown repo that never called `boot()`) → keep the old bare
  // fragment, which FragmentLink handles on its own.
  const href = ctx?.navigationState ? constructOuterUrl(ctx.outerHref, `#${id}`, ctx.navigationState) : `#${id}`;
  return (
    <FragmentLink
      className="ir-heading-anchor"
      href={href}
      onClick={onAnchorClick}
      aria-label="Permalink to this heading"
      {...rest}
    >
      <span aria-hidden="true">#</span>
    </FragmentLink>
  );
};
