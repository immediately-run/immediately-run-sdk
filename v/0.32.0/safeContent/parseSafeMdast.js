let depsPromise = null;
function loadDeps() {
  if (!depsPromise) {
    depsPromise = Promise.all([
      import("mdast-util-from-markdown"),
      import("micromark-extension-mdx-jsx"),
      import("mdast-util-mdx-jsx"),
      import("micromark-extension-gfm"),
      import("mdast-util-gfm")
    ]).then(
      ([fromMd, mdxJsxExt, mdxJsxMdast, gfmExt, gfmMdast]) => ({
        fromMarkdown: fromMd.fromMarkdown,
        mdxJsx: mdxJsxExt.mdxJsx,
        mdxJsxFromMarkdown: mdxJsxMdast.mdxJsxFromMarkdown,
        gfm: gfmExt.gfm,
        gfmFromMarkdown: gfmMdast.gfmFromMarkdown
      })
    );
  }
  return depsPromise;
}
async function parseSafeMdast(source) {
  const { fromMarkdown, mdxJsx, mdxJsxFromMarkdown, gfm, gfmFromMarkdown } = await loadDeps();
  return fromMarkdown(source, {
    // `mdxJsx()` WITHOUT an acorn option → JSX tags + literal attrs; expressions are
    // raw strings, never estree. The mdx *expression* extension is intentionally
    // absent, so `{…}` in body text stays literal. GFM for tables/task-lists.
    extensions: [mdxJsx(), gfm()],
    mdastExtensions: [mdxJsxFromMarkdown(), gfmFromMarkdown()]
  });
}
export {
  parseSafeMdast
};
//# sourceMappingURL=parseSafeMdast.js.map