import { ReactNode } from 'react';
import { Admonition } from './Admonition';
import { Link } from './Link';
import { WikiLink } from './WikiLink';

// The link primitives moved to ./Link so WikiLink can reuse Link without a
// MDXComponents ↔ WikiLink import cycle (check:circular). Re-exported here so the
// public `Link` / `InternalLink` entry points are unchanged.
export { InternalLink, Link } from './Link';
export { Admonition } from './Admonition';
export type { AdmonitionType } from './Admonition';
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
    return (
      <Link href={href} {...properties}>
        {children}
      </Link>
    );
  },
  Admonition,
  WikiLink,
} as Record<string, (props: any) => ReactNode>;
