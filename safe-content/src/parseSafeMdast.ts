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
//
// The dynamic import targets `./mdastDeps` — a SINGLE self-contained artifact that a
// dedicated build pass (`scripts/build-safecontent-deps.mjs`) inlines the whole ESM tree
// into (see `mdastDeps.ts` for the WHY). This keeps the `import()` boundary (a consumer
// that never renders safe content never loads the ~300KB parser) while making the imported
// target one already-bundled file the immediately.run sandbox resolver can fetch without
// walking the unified/micromark conditional-exports tree — the R3-213 on-host packaging
// gap. In jest/ts-jest and the e2e bundle the same `./mdastDeps` resolves to the source
// re-export module, which pulls the real deps from node_modules; the produced tree is
// identical either way.

// Type-only — the plugin VALUES are re-exported from (and inlined by) `./mdastDeps`; a
// value import here would put a bare `@immediately-run/mdx-plugins` specifier in the dist
// the sandbox resolver can't resolve on-host. `import type` is fully erased at build.
import type { HeadingAnchorOptions } from '@immediately-run/mdx-plugins';

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

// `unified`'s `Plugin` type widens the return to `Transformer | void`; the safe path
// invokes each transformer directly on the tree, so narrow it to a plain in-place mutator.
type MdastMutator = (tree: SafeMdastNode) => void;

type Deps = {
  fromMarkdown: (value: string, options: { extensions: unknown[]; mdastExtensions: unknown[] }) => SafeMdastNode;
  mdxJsx: () => unknown;
  mdxJsxFromMarkdown: () => unknown;
  gfm: () => unknown;
  gfmFromMarkdown: () => unknown;
  // The three shared kernel remark plugins, also inlined into `./mdastDeps` (see there).
  remarkAdmonitions: () => MdastMutator;
  remarkWikiLinks: () => MdastMutator;
  remarkHeadingAnchors: (o?: HeadingAnchorOptions) => MdastMutator;
};

let depsPromise: Promise<Deps> | null = null;

function loadDeps(): Promise<Deps> {
  if (!depsPromise) {
    // ONE dynamic import of the pre-inlined artifact (see the header note + `mdastDeps.ts`)
    // — the five ESM parser packages AND the shared remark plugins, none of which the
    // sandbox resolver can walk/resolve as bare specifiers on-host.
    depsPromise = import('./mdastDeps').then((m) => {
      const d = m as unknown as Deps;
      return {
        fromMarkdown: d.fromMarkdown,
        mdxJsx: d.mdxJsx,
        mdxJsxFromMarkdown: d.mdxJsxFromMarkdown,
        gfm: d.gfm,
        gfmFromMarkdown: d.gfmFromMarkdown,
        remarkAdmonitions: d.remarkAdmonitions,
        remarkWikiLinks: d.remarkWikiLinks,
        remarkHeadingAnchors: d.remarkHeadingAnchors,
      } as Deps;
    });
  }
  return depsPromise;
}

export interface ParseSafeMdastOptions {
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
export async function parseSafeMdast(source: string, options: ParseSafeMdastOptions = {}): Promise<SafeMdastNode> {
  const {
    fromMarkdown,
    mdxJsx,
    mdxJsxFromMarkdown,
    gfm,
    gfmFromMarkdown,
    remarkAdmonitions,
    remarkWikiLinks,
    remarkHeadingAnchors,
  } = await loadDeps();
  const tree = fromMarkdown(source, {
    // `mdxJsx()` WITHOUT an acorn option → JSX tags + literal attrs; expressions are
    // raw strings, never estree. The mdx *expression* extension is intentionally
    // absent, so `{…}` in body text stays literal. GFM for tables/task-lists.
    extensions: [mdxJsx(), gfm()],
    mdastExtensions: [mdxJsxFromMarkdown(), gfmFromMarkdown()],
  });
  // The SHARED kernel remark plugins, in the SAME order as the compiled path's `compile.ts`
  // (admonitions §12 → wiki-links §13 → heading/section anchors §15/R3-211).
  remarkAdmonitions()(tree);
  remarkWikiLinks()(tree);
  remarkHeadingAnchors({ sectionIds: options.sectionIds !== false })(tree);
  return tree;
}
