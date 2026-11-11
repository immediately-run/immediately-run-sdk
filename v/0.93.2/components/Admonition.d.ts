import { ReactNode } from 'react';

/** The GitHub admonition kinds the transpiler's `> [!TYPE]` plugin emits (R3-152). */
type AdmonitionType = 'note' | 'tip' | 'important' | 'warning' | 'caution';
/**
 * Default MDX `Admonition` component — the render target for the GitHub-style
 * `> [!NOTE]` blockquote-alert syntax (the transpiler remark plugin, R3-152,
 * compiles that syntax to `<Admonition type="note">…</Admonition>`).
 *
 * It is registered in {@link DEFAULT_MDX_COMPONENTS} so an admonition renders
 * even in a plain-markdown repo that never calls `boot({ mdxComponents })` — the
 * MDX missing-reference guard never fires (MARKDOWN_SYNTAX_SPEC §11.2 phantom
 * defaults). The markup is semantic and accessible; **styling is intentionally
 * minimal** — an app supplies CSS targeting the `ir-admonition*` classes, or
 * overrides this component via `boot({ mdxComponents: { Admonition } })`
 * (MARKDOWN_SYNTAX_SPEC §12.3).
 */
declare const Admonition: ({ type, title, children, ...rest }: {
    type?: AdmonitionType | string;
    title?: ReactNode;
    children?: ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "title">) => ReactNode;

export { Admonition, type AdmonitionType };
