import { ReactNode } from 'react';

/** A same-page anchor (`#frag`): scrolls the addressed section into view on click
 *  **without a route change** (MARKDOWN_SYNTAX_SPEC §13.5). The default behavior of a
 *  bare `#`-href is intercepted so the sandbox URL the host owns is never mutated
 *  out from under it; a fragment that names nothing leaves the scroll position
 *  untouched (a soft failure). */
declare const FragmentLink: ({ href, children, onClick, ...props }: React.DetailedHTMLProps<React.AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>) => ReactNode;
/** An `<a>` that performs in-sandbox navigation on click (prevents the default
 *  full-page load and routes via {@link navigate}). */
declare const InternalLink: ({ href, children, ...props }: React.DetailedHTMLProps<React.AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>) => ReactNode;
/** A link that routes same-app hrefs through the sandbox router (as an
 *  {@link InternalLink}) and renders external hrefs as a plain `<a>`. */
declare const Link: ({ href, children, ...properties }: React.DetailedHTMLProps<React.AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>) => ReactNode;

export { FragmentLink, InternalLink, Link };
