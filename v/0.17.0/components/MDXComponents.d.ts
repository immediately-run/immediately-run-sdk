import * as react_jsx_runtime from 'react/jsx-runtime';
import { ReactNode } from 'react';

/** An `<a>` that performs in-sandbox navigation on click (prevents the default
 *  full-page load and routes via {@link navigate}). */
declare const InternalLink: ({ href, children, ...props }: React.DetailedHTMLProps<React.AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>) => ReactNode;
/** A link that routes same-app hrefs through the sandbox router (as an
 *  {@link InternalLink}) and renders external hrefs as a plain `<a>`. */
declare const Link: ({ href, children, ...properties }: React.DetailedHTMLProps<React.AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>) => ReactNode;
/** Default MDX component overrides: routes `<a>` through {@link Link} so links in
 *  MDX prose navigate within the app. Passed to {@link MDXProvider} by `boot`. */
declare const DEFAULT_MDX_COMPONENTS: {
    a({ href, children, ...properties }: React.DetailedHTMLProps<React.AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>): react_jsx_runtime.JSX.Element;
};

export { DEFAULT_MDX_COMPONENTS, InternalLink, Link };
