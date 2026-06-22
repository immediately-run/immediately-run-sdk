import * as react_jsx_runtime from 'react/jsx-runtime';
import { ReactNode } from 'react';

declare const InternalLink: ({ href, children, ...props }: React.DetailedHTMLProps<React.AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>) => ReactNode;
declare const Link: ({ href, children, ...properties }: React.DetailedHTMLProps<React.AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>) => ReactNode;
declare const DEFAULT_MDX_COMPONENTS: {
    a({ href, children, ...properties }: React.DetailedHTMLProps<React.AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>): react_jsx_runtime.JSX.Element;
};

export { DEFAULT_MDX_COMPONENTS, InternalLink, Link };
