import { ReactNode } from 'react';
export { InternalLink, Link } from './Link.js';
export { Admonition, AdmonitionType } from './Admonition.js';
export { WikiLink } from './WikiLink.js';

/** Default MDX component overrides passed to {@link MDXProvider} by `boot`. These
 *  are the platform's *phantom defaults* (MARKDOWN_SYNTAX_SPEC §11.2): they are
 *  always present in the provider — even for a plain-markdown repo that never
 *  calls `boot({ mdxComponents })` — so the platform-emitted `Admonition` (§12)
 *  and `WikiLink` (§13) components resolve without the MDX missing-reference guard
 *  firing, and Markdown links route in-app via {@link Link}. An app overrides any
 *  of them by name via `boot({ mdxComponents })`, which *merges* over these
 *  defaults (§11.3) — overriding `WikiLink` alone still keeps `a` and `Admonition`. */
declare const DEFAULT_MDX_COMPONENTS: Record<string, (props: any) => ReactNode>;

export { DEFAULT_MDX_COMPONENTS };
