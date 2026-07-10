// The no-acorn parse pipeline for the safe content renderer (TRUST_MODES_SPEC §5.1,
// empirically verified 2026-07-07 against `@mdx-js/mdx` v3 / `micromark-extension-
// mdx-jsx`). This is the load-bearing half of the fail-safe: `<Component/>` syntax
// parses to an element node with **literal** attributes, and every expression
// (`n={1+1}`, `f={fetch("/x")}`, `{...spread}`) is captured as an **inert raw string
// with no estree** — because we pass **NO acorn option** to `micromark-extension-mdx-
// jsx`. There is therefore no evaluator anywhere in the pipeline (fail-safe), unlike
// `@mdx-js/mdx`'s `compile({format:'mdx'})` which always wires acorn.
//
// The §5.1 residual guarantees are also here: the expression micromark extension is
// **not** enabled (body `{…}` stays literal text), and **no `rehype-raw`** / raw-HTML
// passthrough exists — raw HTML blocks arrive as inert `html` mdast nodes the renderer
// prints as text, never injected.
//
// `micromark`/`mdast` are ESM-only. They are loaded with a memoised dynamic `import()`
// (the transpiler's `compile.ts` pattern) so this module sits in the package's CJS
// build too — a CJS consumer that never renders untrusted content never `require()`s
// an ESM-only package, and one that does gets it via Node's ESM-from-CJS import. The
// dynamic load changes only *when* the deps resolve, never the produced tree.

// A minimal structural mdast shape — we deliberately avoid a type dependency on the
// ESM-only `mdast`/`unist` packages (which would break the CJS build's type surface).
export interface SafeMdastNode {
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

export interface SafeMdxAttribute {
  type: 'mdxJsxAttribute' | 'mdxJsxExpressionAttribute';
  name?: string;
  // A literal attribute carries a string; an expression attribute carries an
  // `mdxJsxAttributeValueExpression` object (a raw string, NO estree) or a string.
  value?: string | { type: string; value?: string } | null;
}

type Deps = {
  fromMarkdown: (
    value: string,
    options: { extensions: unknown[]; mdastExtensions: unknown[] },
  ) => SafeMdastNode;
  mdxJsx: () => unknown;
  mdxJsxFromMarkdown: () => unknown;
  gfm: () => unknown;
  gfmFromMarkdown: () => unknown;
};

let depsPromise: Promise<Deps> | null = null;

function loadDeps(): Promise<Deps> {
  if (!depsPromise) {
    depsPromise = Promise.all([
      import('mdast-util-from-markdown'),
      import('micromark-extension-mdx-jsx'),
      import('mdast-util-mdx-jsx'),
      import('micromark-extension-gfm'),
      import('mdast-util-gfm'),
    ]).then(
      ([fromMd, mdxJsxExt, mdxJsxMdast, gfmExt, gfmMdast]) =>
        ({
          fromMarkdown: (fromMd as unknown as { fromMarkdown: Deps['fromMarkdown'] }).fromMarkdown,
          mdxJsx: (mdxJsxExt as unknown as { mdxJsx: Deps['mdxJsx'] }).mdxJsx,
          mdxJsxFromMarkdown: (mdxJsxMdast as unknown as { mdxJsxFromMarkdown: Deps['mdxJsxFromMarkdown'] })
            .mdxJsxFromMarkdown,
          gfm: (gfmExt as unknown as { gfm: Deps['gfm'] }).gfm,
          gfmFromMarkdown: (gfmMdast as unknown as { gfmFromMarkdown: Deps['gfmFromMarkdown'] }).gfmFromMarkdown,
        }) as Deps,
    );
  }
  return depsPromise;
}

/**
 * Parse untrusted Markdown/MDX-syntax source to an mdast tree with **no evaluator in
 * the pipeline**: JSX-as-data (no acorn), GFM on, the expression extension OFF, no
 * raw-HTML re-parse. The returned tree is safe to hand to `renderMdast` — expression
 * attributes are inert strings and raw HTML is inert `html` nodes.
 */
export async function parseSafeMdast(source: string): Promise<SafeMdastNode> {
  const { fromMarkdown, mdxJsx, mdxJsxFromMarkdown, gfm, gfmFromMarkdown } = await loadDeps();
  return fromMarkdown(source, {
    // `mdxJsx()` WITHOUT an acorn option → JSX tags + literal attrs; expressions are
    // raw strings, never estree. The mdx *expression* extension is intentionally
    // absent, so `{…}` in body text stays literal. GFM for tables/task-lists.
    extensions: [mdxJsx(), gfm()],
    mdastExtensions: [mdxJsxFromMarkdown(), gfmFromMarkdown()],
  });
}
