interface SafeMdastNode {
    type: string;
    value?: string;
    name?: string | null;
    url?: string;
    alt?: string | null;
    title?: string | null;
    depth?: number;
    ordered?: boolean;
    lang?: string | null;
    children?: SafeMdastNode[];
    attributes?: SafeMdxAttribute[];
    [key: string]: unknown;
}
interface SafeMdxAttribute {
    type: 'mdxJsxAttribute' | 'mdxJsxExpressionAttribute';
    name?: string;
    value?: string | {
        type: string;
        value?: string;
    } | null;
}
interface ParseSafeMdastOptions {
    /** `false` ⇒ headings use plain text-slug ids (the R3-186 base; no `sec-…` section
     *  ids, no `data-slug`) — the `sectionIds:false` frontmatter opt-out, matching the
     *  compiled path. Default (undefined/true) ⇒ section-like headings get `sec-…` ids
     *  (R3-211). */
    sectionIds?: boolean;
}
/**
 * Parse untrusted Markdown/MDX-syntax source to an mdast tree with **no evaluator in
 * the pipeline**: JSX-as-data (no acorn), GFM on, the expression extension OFF, no
 * raw-HTML re-parse. The returned tree is safe to hand to `renderMdast` — expression
 * attributes are inert strings and raw HTML is inert `html` nodes.
 *
 * After the no-acorn parse it runs the SHARED kernel remark plugins — in the SAME order
 * as the compiled path's `compile.ts` (admonitions §12 → wiki-links §13 → heading/section
 * anchors §15/R3-211; GFM is already applied via the micromark extension above) — so the
 * safe subset renders identically in both standards. The plugins only emit element nodes
 * with LITERAL attributes and set `data.hProperties.id` on headings; they add no evaluator
 * and no acorn, preserving the §5.1 fail-safe.
 */
declare function parseSafeMdast(source: string, options?: ParseSafeMdastOptions): Promise<SafeMdastNode>;

export { type ParseSafeMdastOptions, type SafeMdastNode, type SafeMdxAttribute, parseSafeMdast };
