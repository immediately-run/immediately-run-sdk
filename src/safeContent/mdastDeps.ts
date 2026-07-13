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
