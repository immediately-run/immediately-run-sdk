import { ReactNode } from 'react';

/**
 * Default MDX `WikiLink` component — the render target for the `[[target]]` /
 * `[[label|target]]` wiki-link syntax (the transpiler remark plugin, R3-153,
 * compiles that syntax to `<WikiLink target="…" label="…">`, carrying the raw
 * target verbatim; resolution lives here in the component, MARKDOWN_SYNTAX_SPEC
 * §13.2).
 *
 * Registered in {@link DEFAULT_MDX_COMPONENTS} so wiki-links render even in a
 * plain-markdown repo (§11.2 phantom defaults). Targets are **paths only** —
 * relative (resolved against the current file by the router) or absolute — with
 * **no implicit search path** (§13.3, a deliberate departure from Obsidian).
 * Routes through {@link Link}, so a same-app path navigates in-app and an
 * external href renders as a plain `<a>`.
 *
 * Honesty note (R3-151): this default is the routing baseline. The
 * existence-driven resolved/broken/self visual states (§13.3) are layered on by
 * R3-153; today a link to a missing path simply routes as a normal in-app link.
 * An app overrides this component to add its own states/styling (the headline
 * late-binding capability, §11.1).
 */
declare const WikiLink: ({ target, label, children, ...rest }: {
    target?: string;
    label?: ReactNode;
    children?: ReactNode;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) => ReactNode;

export { WikiLink };
