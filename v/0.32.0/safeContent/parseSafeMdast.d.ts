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
/**
 * Parse untrusted Markdown/MDX-syntax source to an mdast tree with **no evaluator in
 * the pipeline**: JSX-as-data (no acorn), GFM on, the expression extension OFF, no
 * raw-HTML re-parse. The returned tree is safe to hand to `renderMdast` — expression
 * attributes are inert strings and raw HTML is inert `html` nodes.
 */
declare function parseSafeMdast(source: string): Promise<SafeMdastNode>;

export { type SafeMdastNode, type SafeMdxAttribute, parseSafeMdast };
