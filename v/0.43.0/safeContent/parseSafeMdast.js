import "../chunk-VHAA22YE.js";
let depsPromise = null;
function loadDeps() {
  if (!depsPromise) {
    depsPromise = import("./mdastDeps").then((m) => {
      const d = m;
      return {
        fromMarkdown: d.fromMarkdown,
        mdxJsx: d.mdxJsx,
        mdxJsxFromMarkdown: d.mdxJsxFromMarkdown,
        gfm: d.gfm,
        gfmFromMarkdown: d.gfmFromMarkdown,
        remarkAdmonitions: d.remarkAdmonitions,
        remarkWikiLinks: d.remarkWikiLinks,
        remarkHeadingAnchors: d.remarkHeadingAnchors
      };
    });
  }
  return depsPromise;
}
async function parseSafeMdast(source, options = {}) {
  const {
    fromMarkdown,
    mdxJsx,
    mdxJsxFromMarkdown,
    gfm,
    gfmFromMarkdown,
    remarkAdmonitions,
    remarkWikiLinks,
    remarkHeadingAnchors
  } = await loadDeps();
  const tree = fromMarkdown(source, {
    // `mdxJsx()` WITHOUT an acorn option → JSX tags + literal attrs; expressions are
    // raw strings, never estree. The mdx *expression* extension is intentionally
    // absent, so `{…}` in body text stays literal. GFM for tables/task-lists.
    extensions: [mdxJsx(), gfm()],
    mdastExtensions: [mdxJsxFromMarkdown(), gfmFromMarkdown()]
  });
  remarkAdmonitions()(tree);
  remarkWikiLinks()(tree);
  remarkHeadingAnchors({ sectionIds: options.sectionIds !== false })(tree);
  return tree;
}
export {
  parseSafeMdast
};
//# sourceMappingURL=parseSafeMdast.js.map