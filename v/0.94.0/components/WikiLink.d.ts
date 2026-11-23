import { ReactNode } from 'react';

/**
 * Default MDX `WikiLink` component — the render target for the `[[target]]` /
 * `[[label|target]]` wiki-link syntax. The transpiler remark plugin (R3-153)
 * compiles that syntax to `<WikiLink target="…" label="…">`, carrying the raw
 * target/label verbatim; **resolution lives here** (MARKDOWN_SYNTAX_SPEC §13.2).
 *
 * Registered in {@link DEFAULT_MDX_COMPONENTS} so wiki-links render even in a
 * plain-markdown repo (§11.2 phantom defaults). Targets are **paths only** —
 * relative (resolved against the current file's directory) or absolute — with
 * **no implicit search path** (§13.3, a deliberate departure from Obsidian).
 *
 * The **current file** — the one the link is *authored in* — is read from the
 * ambient `<Include>` render context. Every MDX file renders through `<Include>`
 * (`FileRouter` renders even the top-level file that way), and Include publishes
 * the rendered module's `EvaluationContext` to its subtree via
 * {@link RenderExportedComponentContext}; the nearest one's
 * `evaluation.module.filepath` is this file's own `/app/…` path. Because that
 * context nests with each `<Include>`, a relative target inside an included
 * fragment resolves against the **fragment**, not the top-level page in the URL.
 *
 * A target may carry a `#fragment` (`[[FILE.mdx#sec-8-9]]`, `[[#sec-8-9]]`): the
 * fragment is **split off** ({@link splitHash}, §13.5) and existence is resolved on
 * the **fragment-stripped path**, so a section citation to an existing file resolves
 * (not "broken"). The fragment then rides to navigation, where the scroll-after-nav
 * effect ({@link useScrollAfterNavigation}) lands the reader on the section.
 *
 * The resolved path is checked for **existence** against the live metadata store
 * (keyed by absolute `/app/…` paths) for the states (§13.3, §13.5):
 * - **anchor** — a fragment with no path (`[[#sec-8-9]]`), or a fragment whose path is
 *   the current file: a same-page {@link Link} that scrolls in place, no route change.
 * - **self** — the resolved path is the current file (no fragment): inert text, no link.
 * - **broken** — no file at the resolved path (and the store has loaded): rendered
 *   as marked text, **not** a throw.
 * - **resolved** — routed through {@link Link} (in-app navigation for a same-app
 *   href, a plain `<a>` otherwise), carrying any `#fragment`.
 *
 * The check is **optimistic until the metadata store loads** (an empty store never
 * flashes "broken"), and a relative target with no ambient render context (MDX
 * rendered outside `<Include>`) routes optimistically. Such an app overrides this
 * component (§11) for precise resolution.
 */
declare const WikiLink: ({ target, label, children, ...rest }: {
    target?: string;
    label?: ReactNode;
    children?: ReactNode;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) => ReactNode;

export { WikiLink };
