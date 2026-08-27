import { ReactNode } from 'react';

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
declare const HeadingAnchor: ({ id, ...rest }: {
    id?: string;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) => ReactNode;

export { HeadingAnchor };
