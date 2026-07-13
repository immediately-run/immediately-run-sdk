import {
  remarkAdmonitions,
  remarkWikiLinks,
  remarkHeadingAnchors
} from "@immediately-run/mdx-plugins";
let depsPromise = null;
function loadDeps() {
  if (!depsPromise) {
    depsPromise = import("./mdastDeps").then(
      (m) => ({
        fromMarkdown: m.fromMarkdown,
        mdxJsx: m.mdxJsx,
        mdxJsxFromMarkdown: m.mdxJsxFromMarkdown,
        gfm: m.gfm,
        gfmFromMarkdown: m.gfmFromMarkdown
      })
    );
  }
  return depsPromise;
}
const admonitions = remarkAdmonitions;
const wikiLinks = remarkWikiLinks;
const headingAnchors = remarkHeadingAnchors;
async function parseSafeMdast(source, options = {}) {
  const { fromMarkdown, mdxJsx, mdxJsxFromMarkdown, gfm, gfmFromMarkdown } = await loadDeps();
  const tree = fromMarkdown(source, {
    // `mdxJsx()` WITHOUT an acorn option → JSX tags + literal attrs; expressions are
    // raw strings, never estree. The mdx *expression* extension is intentionally
    // absent, so `{…}` in body text stays literal. GFM for tables/task-lists.
    extensions: [mdxJsx(), gfm()],
    mdastExtensions: [mdxJsxFromMarkdown(), gfmFromMarkdown()]
  });
  admonitions()(tree);
  wikiLinks()(tree);
  headingAnchors({ sectionIds: options.sectionIds !== false })(tree);
  return tree;
}
export {
  parseSafeMdast
};
//# sourceMappingURL=parseSafeMdast.js.map