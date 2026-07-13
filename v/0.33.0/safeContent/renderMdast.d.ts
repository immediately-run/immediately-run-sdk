import { ReactNode } from 'react';
import { SafeMdastNode } from './parseSafeMdast.js';

interface SafeContentComponents {
    /** Safe components an app exposes to `<Component/>` syntax (host/app-provided).
     *  Looked up by the JSX tag name; anything not here renders inert. */
    [tag: string]: React.ComponentType<Record<string, string>>;
}
interface RenderMdastOptions {
    /** The component registry for `<Component/>` syntax. Absent ⇒ all JSX tags inert. */
    components?: SafeContentComponents;
    /**
     * Resolve a wikilink target to an href, **within the granted mount only** — a pure,
     * synchronous, mount-scoped lookup that MUST NOT fetch or reach out of the mount.
     * Return `undefined` for an unresolvable/out-of-mount target (rendered as inert
     * text). Absent ⇒ every wikilink renders as inert text.
     */
    resolveWikiLink?: (target: string) => string | undefined;
}
/**
 * Render a safe-parsed mdast tree to React. Pure and synchronous; carries every §5.1
 * security property (registry-only JSX, dropped expressions, inert raw HTML, URL
 * sanitizing, in-mount wikilinks). Feed it a tree from {@link parseSafeMdast}.
 */
declare function renderMdast(tree: SafeMdastNode, options?: RenderMdastOptions): ReactNode;

export { type RenderMdastOptions, type SafeContentComponents, renderMdast };
