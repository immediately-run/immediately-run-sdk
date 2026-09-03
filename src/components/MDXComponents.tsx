import { ReactNode, use } from 'react';
import { Admonition } from './Admonition';
import { FS_PREFIX, LinkSpaceContext, resolveLinkTarget } from '../linkSpace';
import { splitHash } from '../urlUtils';
import { HeadingAnchor } from './HeadingAnchor';
import { Link } from './Link';
import { WikiLink } from './WikiLink';

// The link primitives moved to ./Link so WikiLink can reuse Link without a
// MDXComponents ↔ WikiLink import cycle (check:circular). Re-exported here so the
// public `Link` / `InternalLink` entry points are unchanged.
export { InternalLink, Link } from './Link';
export { Admonition } from './Admonition';
export type { AdmonitionType } from './Admonition';
export { HeadingAnchor } from './HeadingAnchor';
export { WikiLink } from './WikiLink';

/** Default MDX component overrides passed to {@link MDXProvider} by `boot`. These
 *  are the platform's *phantom defaults* (MARKDOWN_SYNTAX_SPEC §11.2): they are
 *  always present in the provider — even for a plain-markdown repo that never
 *  calls `boot({ mdxComponents })` — so the platform-emitted `Admonition` (§12)
 *  and `WikiLink` (§13) components resolve without the MDX missing-reference guard
 *  firing, and Markdown links route in-app via {@link Link}. An app overrides any
 *  of them by name via `boot({ mdxComponents })`, which *merges* over these
 *  defaults (§11.3) — overriding `WikiLink` alone still keeps `a` and `Admonition`. */
export const DEFAULT_MDX_COMPONENTS = {
  a({
    href,
    children,
    ...properties
  }: React.DetailedHTMLProps<React.AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>) {
    // R3-273 link spaces, same shared resolver as WikiLink: an `$fs:` href is
    // translated to its mount-absolute path; an ABSOLUTE href is corpus-rooted
    // when an enclosing LinkSpaceContext declares a corpusRoot (a non-corpus app
    // declares none and is untouched). Relative and external hrefs pass through —
    // <Link> already routes same-app hrefs and renders the rest as plain anchors.
    const { corpusRoot } = use(LinkSpaceContext);
    let mapped = href;
    if (href && (href.startsWith(FS_PREFIX) || (corpusRoot !== null && href.startsWith('/')))) {
      const [pathPart, frag] = splitHash(href);
      const resolution = resolveLinkTarget(pathPart, { corpusRoot });
      if (resolution.state !== 'resolved') {
        // Malformed `$fs:` (incl. scheme smuggling) — broken text, never an anchor.
        return (
          <span className="ir-link-broken" data-state="broken" title={`Invalid ${FS_PREFIX} link: ${href}`}>
            {children}
          </span>
        );
      }
      mapped = `${resolution.path}${frag ? `#${frag}` : ''}`;
    }
    return (
      <Link href={mapped} {...properties}>
        {children}
      </Link>
    );
  },
  Admonition,
  HeadingAnchor,
  WikiLink,
} as Record<string, (props: any) => ReactNode>;
