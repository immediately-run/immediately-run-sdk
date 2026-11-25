import * as react from 'react';
import { ComponentPropsWithRef } from 'react';

interface ProseProps extends ComponentPropsWithRef<'article'> {
    /**
     * The repo-relative path of the Markdown file this wraps. When set, the author token
     * file that governs it (`PROSE_TOKEN_FILE`, or the file a bundle marker's `styles`
     * names — MARKDOWN_SYNTAX_SPEC §16.6) restyles this article. `FileRouter` passes it.
     */
    filename?: string;
}
/**
 * The wrapper for rendered Markdown: an `<article class="ir-prose">` styled by the SDK's
 * layered default stylesheet and keyed to the host theme through `data-theme`.
 *
 * `FileRouter` uses it for every routed `.md`/`.mdx` file. An app that renders Markdown
 * itself can wrap its content in it to get the same typography; any unlayered CSS the app
 * ships overrides the defaults, and setting a token such as `--accent` or `--sans` on an
 * ancestor restyles every rule that reads it.
 */
declare const Prose: ({ className, children, filename, ref, ...rest }: ProseProps) => react.JSX.Element;

export { Prose, type ProseProps };
