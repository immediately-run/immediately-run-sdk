// The ESM-only mdast/micromark parser deps for the safe renderer, re-exported as ONE
// module so a dedicated build pass can inline the whole tree into a single
// self-contained dist file.
//
// WHY this file exists (R3-213 packaging gap): `parseSafeMdast` needs
// `mdast-util-from-markdown` + `micromark-extension-mdx-jsx` + friends, an ESM tree with
// deep `exports` conditional maps (`devlop`, `unist-*`, `decode-named-character-reference`,
// `micromark-factory-*`). The immediately.run sandbox's in-browser resolver (package CDN +
// esm.sh fallback) **cannot inline that conditional-exports tree** — the same wall the
// Babel worker hit (see the SDK memory `babel-worker-packaging`): a bare
// `import('mdast-util-from-markdown')` on-host fails with "esm.sh module spans internal
// chunk(s)… the single-module fallback can't inline it". Declaring the deps in the app's
// `package.json` does not help — the CDN still can't walk the tree.
//
// The fix mirrors how the transpiler bundles `@mdx-js/mdx`: a real bundler (esbuild, via
// `scripts/build-safecontent-deps.mjs`) inlines this module's entire graph into ONE
// self-contained artifact at `dist/safeContent/mdastDeps.js` (+ `.cjs`). `parseSafeMdast`
// dynamically `import()`s THIS module (`./mdastDeps`), so on-host the sandbox fetches a
// single already-inlined file with **zero remaining bare specifiers** to resolve — the
// resolver never has to walk the conditional-exports tree.
//
// The build pass uses the DOM-free (`worker`) package variants (like the Babel worker),
// so the bundle carries no `document.createElement` dependency and is context-portable.
//
// Fail-safe unchanged: this file re-exports only the parser primitives. `parseSafeMdast`
// still passes **no acorn option** to `mdxJsx()`, so there is no evaluator anywhere in the
// pipeline; the acorn package is not a runtime dependency of this tree (only a JSDoc type
// reference + one inert `ruleId: 'acorn'` string in `micromark-factory-mdx-expression`),
// so the inlined bundle contains no acorn code — proven by the e2e's import-edge check.
export { fromMarkdown } from 'mdast-util-from-markdown';
export { mdxJsx } from 'micromark-extension-mdx-jsx';
export { mdxJsxFromMarkdown } from 'mdast-util-mdx-jsx';
export { gfm } from 'micromark-extension-gfm';
export { gfmFromMarkdown } from 'mdast-util-gfm';

// The three kernel remark plugins for the MDX safe subset (admonitions §12 / wiki-links
// §13 / heading+section anchors §15/R3-211). They live in the SHARED `@immediately-run/
// mdx-plugins` package the compiled path (transpiler) also consumes, so the two render
// standards build from ONE plugin source and can't drift (TRUST_MODES_SPEC §5/§5.1,
// R3-213). They are re-exported HERE — and thus inlined into this bundle — because
// `parseSafeMdast` imported them with a bare `@immediately-run/mdx-plugins` specifier the
// sandbox resolver could not resolve on-host either (a transitive dep of the SDK, absent
// from the app's node_modules closure). Inlining them mirrors the transpiler, which
// bundles the same package via `noExternal`. The plugins are pure mdast transforms with a
// type-only `unified` dep and no acorn/`@mdx-js/mdx` edge, so they don't taint the
// no-evaluator guarantee.
export {
  remarkAdmonitions,
  remarkWikiLinks,
  remarkHeadingAnchors,
} from '@immediately-run/mdx-plugins';
