import { ReactNode } from 'react';

/** An `<a>` that performs in-sandbox navigation on click (prevents the default
 *  full-page load and routes via {@link navigate}). */
declare const InternalLink: ({ href, children, ...props }: React.DetailedHTMLProps<React.AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>) => ReactNode;
/** A link that routes same-app hrefs through the sandbox router (as an
 *  {@link InternalLink}) and renders external hrefs as a plain `<a>`. */
declare const Link: ({ href, children, ...properties }: React.DetailedHTMLProps<React.AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>) => ReactNode;

export { InternalLink, Link };
