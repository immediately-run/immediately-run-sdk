import { createElement, Fragment } from "react";
import { sanitizeUrl } from "./sanitizeUrl";
import { splitWikiLinks } from "./wikilink";
function literalProps(attributes) {
  const props = {};
  for (const attr of attributes ?? []) {
    if (attr.type !== "mdxJsxAttribute") continue;
    if (typeof attr.name !== "string") continue;
    if (typeof attr.value === "string") props[attr.name] = attr.value;
    else if (attr.value === null || attr.value === void 0) props[attr.name] = "";
  }
  return props;
}
let keyCounter = 0;
const nextKey = () => `sc-${keyCounter++}`;
function renderWiki(token, resolve) {
  const label = token.label ?? token.target;
  const href = resolve?.(token.target);
  const safe = href !== void 0 ? sanitizeUrl(href) : void 0;
  if (safe === void 0) return label;
  return createElement("a", { href: safe, "data-wikilink": token.target, key: nextKey() }, label);
}
function renderText(value, opts) {
  const parts = splitWikiLinks(value);
  if (!parts) return value;
  return parts.map(
    (p, i) => "text" in p ? createElement(Fragment, { key: `t${i}` }, p.text) : createElement(Fragment, { key: `w${i}` }, renderWiki(p.wiki, opts.resolveWikiLink))
  );
}
function renderChildren(node, opts) {
  return (node.children ?? []).map((c, i) => renderNode(c, opts, i));
}
const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"];
function renderNode(node, opts, index = 0) {
  const key = `n${index}`;
  switch (node.type) {
    case "root":
      return createElement(Fragment, { key }, ...renderChildren(node, opts));
    case "text":
      return renderText(node.value ?? "", opts);
    case "paragraph":
      return createElement("p", { key }, ...renderChildren(node, opts));
    case "heading": {
      const tag = HEADING_TAGS[Math.min(Math.max((node.depth ?? 1) - 1, 0), 5)];
      const hp = node.data?.hProperties;
      const headingProps = {};
      if (typeof hp?.id === "string") headingProps.id = hp.id;
      if (typeof hp?.["data-slug"] === "string") headingProps["data-slug"] = hp["data-slug"];
      return createElement(tag, { key, ...headingProps }, ...renderChildren(node, opts));
    }
    case "strong":
      return createElement("strong", { key }, ...renderChildren(node, opts));
    case "emphasis":
      return createElement("em", { key }, ...renderChildren(node, opts));
    case "delete":
      return createElement("del", { key }, ...renderChildren(node, opts));
    case "inlineCode":
      return createElement("code", { key }, node.value ?? "");
    case "code":
      return createElement("pre", { key }, createElement("code", null, node.value ?? ""));
    case "blockquote":
      return createElement("blockquote", { key }, ...renderChildren(node, opts));
    case "list":
      return createElement(node.ordered ? "ol" : "ul", { key }, ...renderChildren(node, opts));
    case "listItem":
      return createElement("li", { key }, ...renderChildren(node, opts));
    case "thematicBreak":
      return createElement("hr", { key });
    case "break":
      return createElement("br", { key });
    case "link": {
      const href = sanitizeUrl(node.url);
      if (href === void 0) return createElement(Fragment, { key }, ...renderChildren(node, opts));
      return createElement("a", { key, href, title: node.title ?? void 0 }, ...renderChildren(node, opts));
    }
    case "image": {
      const src = sanitizeUrl(node.url);
      if (src === void 0) return node.alt ? createElement(Fragment, { key }, node.alt) : null;
      return createElement("img", { key, src, alt: node.alt ?? "", title: node.title ?? void 0 });
    }
    // GFM tables.
    case "table":
      return createElement("table", { key }, createElement("tbody", null, ...renderChildren(node, opts)));
    case "tableRow":
      return createElement("tr", { key }, ...renderChildren(node, opts));
    case "tableCell":
      return createElement("td", { key }, ...renderChildren(node, opts));
    // Raw HTML (`<script>`, `<div onclick>` at block level) → INERT TEXT. No
    // `rehype-raw`, never `dangerouslySetInnerHTML`. The literal markup is shown, not run.
    case "html":
      return createElement(Fragment, { key }, node.value ?? "");
    // JSX `<Component/>` syntax → registry lookup by NAME, literal props only.
    case "mdxJsxFlowElement":
    case "mdxJsxTextElement": {
      const name = typeof node.name === "string" ? node.name : "";
      const Component = name ? opts.components?.[name] : void 0;
      const children = renderChildren(node, opts);
      if (!Component) return createElement(Fragment, { key }, ...children);
      return createElement(Component, { key, ...literalProps(node.attributes) }, ...children);
    }
    // Inert expression nodes (should not occur — expression extension is off — but be
    // defensive if a tree from elsewhere carries them): render nothing.
    case "mdxFlowExpression":
    case "mdxTextExpression":
    case "mdxjsEsm":
      return null;
    default:
      return node.children ? createElement(Fragment, { key }, ...renderChildren(node, opts)) : null;
  }
}
function renderMdast(tree, options = {}) {
  keyCounter = 0;
  return renderNode(tree, options);
}
export {
  renderMdast
};
//# sourceMappingURL=renderMdast.js.map