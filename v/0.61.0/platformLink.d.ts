import * as react from 'react';
import { AnchorHTMLAttributes, ReactNode } from 'react';

/**
 * Build a PLATFORM-space href (`/present/…`, `/edit/github/…`, `/home`) in the host's URL
 * space, reading `outerHref` from {@link TinkerableContext} the way `useTinkerableLink` does.
 * The returned closure is fresh each render (its output is pure, so identity churn is
 * harmless); an empty context (no host, `vite dev`) yields the path unchanged.
 *
 * Render the result through {@link PlatformLink}, which also carries `target="_top"` —
 * a root-relative href inside the sandboxed frame would resolve against the SANDBOX origin
 * and land nowhere, and an anchor without `target="_top"` navigates the frame instead of
 * the page.
 */
declare const usePlatformHref: () => ((path: string) => string);
interface PlatformLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
    /** A root-relative platform path, e.g. `/present/github/acme/todo`. */
    path: string;
    children?: ReactNode;
}
/**
 * The ONE way to render an anchor to a PLATFORM route: it builds the href with
 * {@link platformHref} (resolving against the host's outer origin) and always carries
 * `target="_top"`, because an anchor inside the sandboxed frame otherwise navigates the
 * frame instead of the host document. External URLs (`https://…`) are not platform routes
 * and should stay plain `<a target="_blank">` anchors.
 */
declare function PlatformLink({ path, children, ...rest }: PlatformLinkProps): react.JSX.Element;

export { PlatformLink, type PlatformLinkProps, usePlatformHref };
