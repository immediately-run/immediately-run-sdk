var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// node_modules/@immediately-run/mdx-plugins/dist/index.js
function textSlug(text) {
  return text.trim().toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}
function sectionId(text) {
  const m = text.trim().match(LEADING_TOKEN);
  if (!m) return null;
  const token = m[1];
  const firstComponent = token.split(".")[0];
  const sectionLike = /\d/.test(firstComponent) || /^[A-Za-z]\./.test(token);
  if (!sectionLike) return null;
  return "sec-" + token.toLowerCase().replace(/\./g, "-");
}
function headingId(text, options = {}) {
  const sec = options.sectionIds !== false ? sectionId(text) : null;
  if (sec) return sec;
  const slug = textSlug(text);
  return slug === "" ? "section" : slug;
}
function headingText(node) {
  let out = "";
  const visit = (n) => {
    if (n.type === "text" || n.type === "inlineCode") {
      out += n.value ?? "";
      return;
    }
    if (n.type === "mdxJsxTextElement" || n.type === "mdxTextExpression") return;
    if (Array.isArray(n.children)) n.children.forEach(visit);
  };
  if (Array.isArray(node.children)) node.children.forEach(visit);
  return out;
}
function hasAuthorId(node) {
  const id = node.data?.hProperties?.id;
  return typeof id === "string" && id.length > 0;
}
function anchorNode(id) {
  return {
    type: "mdxJsxTextElement",
    name: "HeadingAnchor",
    attributes: [{ type: "mdxJsxAttribute", name: "id", value: id }],
    children: []
  };
}
function resolveCorpusAbsolute(path, corpusRoot) {
  const inner = normalizeAbsolute(path);
  if (corpusRoot === null || corpusRoot === "/") return { state: "resolved", path: inner };
  return { state: "resolved", path: normalizeAbsolute(corpusRoot + inner) };
}
function resolveLinkTarget(raw, opts = {}) {
  if (raw.startsWith(FS_PREFIX)) {
    const rest = raw.slice(FS_PREFIX.length);
    if (!rest.startsWith("/")) return { state: "invalid" };
    if (opts.bundleChrooted) return resolveCorpusAbsolute(rest, opts.corpusRoot ?? null);
    return { state: "resolved", path: normalizeAbsolute(rest) };
  }
  if (raw.startsWith("/")) {
    const corpusRoot = opts.corpusRoot ?? null;
    if (corpusRoot !== null) {
      return resolveCorpusAbsolute(raw, corpusRoot);
    }
    return { state: "resolved", path: normalizeAbsolute(raw) };
  }
  if (!opts.currentFile) return { state: "unresolvable" };
  const dir = opts.currentFile.slice(0, opts.currentFile.lastIndexOf("/"));
  return { state: "resolved", path: normalizeAbsolute(`${dir}/${raw}`) };
}
function toWikiLink(inner) {
  const pipe = inner.indexOf("|");
  let target;
  let label;
  if (pipe === -1) {
    target = inner.trim();
  } else {
    label = inner.slice(0, pipe).trim();
    target = inner.slice(pipe + 1).trim();
  }
  if (target === "") return null;
  const attributes = [
    { type: "mdxJsxAttribute", name: "target", value: target }
  ];
  if (label) {
    attributes.push({ type: "mdxJsxAttribute", name: "label", value: label });
  }
  return {
    type: "mdxJsxTextElement",
    // inline (phrasing) — a wiki-link sits in a paragraph
    name: "WikiLink",
    attributes,
    children: []
  };
}
function splitTextNode(node) {
  const value = node.value;
  if (typeof value !== "string" || value.indexOf("[[") === -1) return null;
  const out = [];
  let lastIndex = 0;
  let produced = false;
  WIKILINK.lastIndex = 0;
  let match;
  while ((match = WIKILINK.exec(value)) !== null) {
    const wl = toWikiLink(match[1]);
    if (!wl) continue;
    if (match.index > lastIndex) {
      out.push({ type: "text", value: value.slice(lastIndex, match.index) });
    }
    out.push(wl);
    lastIndex = match.index + match[0].length;
    produced = true;
  }
  if (!produced) return null;
  if (lastIndex < value.length) {
    out.push({ type: "text", value: value.slice(lastIndex) });
  }
  return out;
}
function walk(node) {
  const children = node.children;
  if (!Array.isArray(children)) return;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.type === "text") {
      const replacement = splitTextNode(child);
      if (replacement) {
        children.splice(i, 1, ...replacement);
        i += replacement.length - 1;
      }
      continue;
    }
    walk(child);
  }
}
function toAdmonition(blockquote) {
  const firstBlock = blockquote.children?.[0];
  if (!firstBlock || firstBlock.type !== "paragraph") return null;
  const inlines = firstBlock.children;
  const firstInline = inlines?.[0];
  if (!firstInline || firstInline.type !== "text" || typeof firstInline.value !== "string") {
    return null;
  }
  const match = MARKER.exec(firstInline.value);
  if (!match) return null;
  const consumedNewline = match[2] !== "";
  if (!consumedNewline && (inlines?.length ?? 0) > 1) return null;
  const type = match[1].toLowerCase();
  const rest = firstInline.value.slice(match[0].length);
  if (rest.length === 0) {
    inlines.shift();
    if (inlines.length === 0) blockquote.children.shift();
  } else {
    firstInline.value = rest;
  }
  return {
    type: "mdxJsxFlowElement",
    name: "Admonition",
    attributes: [{ type: "mdxJsxAttribute", name: "type", value: type }],
    children: blockquote.children ?? []
  };
}
function walk2(node) {
  const children = node.children;
  if (!Array.isArray(children)) return;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.type === "blockquote") {
      const converted = toAdmonition(child);
      if (converted) {
        children[i] = converted;
        walk2(converted);
        continue;
      }
    }
    walk2(child);
  }
}
var LEADING_TOKEN, remarkHeadingAnchors, remarkHeadingAnchors_default, FS_PREFIX, normalizeAbsolute, WIKILINK, remarkWikiLinks, remarkWikiLinks_default, MARKER, remarkAdmonitions, remarkAdmonitions_default;
var init_dist = __esm({
  "node_modules/@immediately-run/mdx-plugins/dist/index.js"() {
    LEADING_TOKEN = /^([A-Za-z0-9]+(?:\.[A-Za-z0-9]+)*)/;
    remarkHeadingAnchors = (options = {}) => (tree) => {
      const sectionEnabled = options.sectionIds !== false;
      const seen = /* @__PURE__ */ new Map();
      const root = tree;
      const children = root.children;
      if (!Array.isArray(children)) return;
      for (const node of children) {
        if (node.type !== "heading") continue;
        if (hasAuthorId(node)) continue;
        const text = headingText(node);
        const slug = textSlug(text);
        const sec = sectionEnabled ? sectionId(text) : null;
        const baseId = headingId(text, { sectionIds: sectionEnabled });
        const n = seen.get(baseId) ?? 0;
        seen.set(baseId, n + 1);
        const id = n === 0 ? baseId : `${baseId}-${n}`;
        const hProperties = (node.data ?? (node.data = {})).hProperties ?? (node.data.hProperties = {});
        hProperties.id = id;
        if (sec && slug && slug !== id) hProperties["data-slug"] = slug;
        node.children = [anchorNode(id), ...node.children ?? []];
      }
    };
    remarkHeadingAnchors_default = remarkHeadingAnchors;
    FS_PREFIX = "$fs:";
    normalizeAbsolute = (path) => {
      const out = [];
      for (const seg of path.split("/")) {
        if (seg === "" || seg === ".") continue;
        if (seg === "..") out.pop();
        else out.push(seg);
      }
      return "/" + out.join("/");
    };
    WIKILINK = /\[\[([^[\]]+)\]\]/g;
    remarkWikiLinks = () => (tree) => {
      walk(tree);
    };
    remarkWikiLinks_default = remarkWikiLinks;
    MARKER = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(\r?\n|$)/i;
    remarkAdmonitions = () => (tree) => {
      walk2(tree);
    };
    remarkAdmonitions_default = remarkAdmonitions;
  }
});

// src/mdastDeps.ts
var mdastDeps_exports = {};
__export(mdastDeps_exports, {
  fromMarkdown: () => fromMarkdown,
  gfm: () => gfm,
  gfmFromMarkdown: () => gfmFromMarkdown,
  mdxJsx: () => mdxJsx,
  mdxJsxFromMarkdown: () => mdxJsxFromMarkdown,
  remarkAdmonitions: () => remarkAdmonitions_default,
  remarkHeadingAnchors: () => remarkHeadingAnchors_default,
  remarkWikiLinks: () => remarkWikiLinks_default
});
import { fromMarkdown } from "mdast-util-from-markdown";
import { mdxJsx } from "micromark-extension-mdx-jsx";
import { mdxJsxFromMarkdown } from "mdast-util-mdx-jsx";
import { gfm } from "micromark-extension-gfm";
import { gfmFromMarkdown } from "mdast-util-gfm";
var init_mdastDeps = __esm({
  "src/mdastDeps.ts"() {
    "use strict";
    init_dist();
  }
});

// src/SafeContent.tsx
import { useEffect, useMemo, useRef, useState } from "react";

// src/parseSafeMdast.ts
var depsPromise = null;
function loadDeps() {
  if (!depsPromise) {
    depsPromise = Promise.resolve().then(() => (init_mdastDeps(), mdastDeps_exports)).then((m) => {
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
    fromMarkdown: fromMarkdown2,
    mdxJsx: mdxJsx2,
    mdxJsxFromMarkdown: mdxJsxFromMarkdown2,
    gfm: gfm2,
    gfmFromMarkdown: gfmFromMarkdown2,
    remarkAdmonitions: remarkAdmonitions2,
    remarkWikiLinks: remarkWikiLinks2,
    remarkHeadingAnchors: remarkHeadingAnchors2
  } = await loadDeps();
  const tree = fromMarkdown2(source, {
    // `mdxJsx()` WITHOUT an acorn option → JSX tags + literal attrs; expressions are
    // raw strings, never estree. The mdx *expression* extension is intentionally
    // absent, so `{…}` in body text stays literal. GFM for tables/task-lists.
    extensions: [mdxJsx2(), gfm2()],
    mdastExtensions: [mdxJsxFromMarkdown2(), gfmFromMarkdown2()]
  });
  remarkAdmonitions2()(tree);
  remarkWikiLinks2()(tree);
  remarkHeadingAnchors2({ sectionIds: options.sectionIds !== false })(tree);
  return tree;
}

// src/renderMdast.tsx
import { createElement, Fragment } from "react";

// src/sanitizeUrl.ts
var SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;
var ALLOWED_SCHEMES = /* @__PURE__ */ new Set(["http", "https", "mailto"]);
var CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;
function sanitizeUrl(url) {
  if (typeof url !== "string") return void 0;
  const cleaned = url.replace(CONTROL_CHARS, "").trim();
  if (cleaned === "") return void 0;
  const m = SCHEME.exec(cleaned);
  if (!m) return cleaned;
  return ALLOWED_SCHEMES.has(m[1].toLowerCase()) ? cleaned : void 0;
}

// src/wikilink.ts
var WIKILINK2 = /\[\[([^[\]]+)\]\]/g;
function parseWikiInner(inner) {
  const pipe = inner.indexOf("|");
  let target;
  let label;
  if (pipe === -1) {
    target = inner.trim();
  } else {
    label = inner.slice(0, pipe).trim();
    target = inner.slice(pipe + 1).trim();
  }
  if (target === "") return null;
  return label ? { target, label } : { target };
}
function splitWikiLinks(value) {
  if (value.indexOf("[[") === -1) return null;
  const out = [];
  let lastIndex = 0;
  let produced = false;
  WIKILINK2.lastIndex = 0;
  let match;
  while ((match = WIKILINK2.exec(value)) !== null) {
    const token = parseWikiInner(match[1]);
    if (!token) continue;
    if (match.index > lastIndex) out.push({ text: value.slice(lastIndex, match.index) });
    out.push({ wiki: token });
    lastIndex = match.index + match[0].length;
    produced = true;
  }
  if (!produced) return null;
  if (lastIndex < value.length) out.push({ text: value.slice(lastIndex) });
  return out;
}

// src/renderMdast.tsx
init_dist();
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
var keyCounter = 0;
var nextKey = () => `sc-${keyCounter++}`;
function elementFor(tag, components) {
  return components?.[tag] ?? tag;
}
function renderWiki(token, opts) {
  const label = token.label ?? token.target;
  if (resolveLinkTarget(token.target).state === "invalid") return label;
  const href = opts.resolveWikiLink?.(token.target);
  const safe = href !== void 0 ? sanitizeUrl(href) : void 0;
  if (safe === void 0) return label;
  return createElement(
    elementFor("a", opts.components),
    { href: safe, "data-wikilink": token.target, key: nextKey() },
    label
  );
}
function renderText(value, opts) {
  const parts = splitWikiLinks(value);
  if (!parts) return value;
  return parts.map(
    (p, i) => "text" in p ? createElement(Fragment, { key: `t${i}` }, p.text) : createElement(Fragment, { key: `w${i}` }, renderWiki(p.wiki, opts))
  );
}
function renderChildren(node, opts) {
  return (node.children ?? []).map((c, i) => renderNode(c, opts, i));
}
var HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"];
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
      return createElement(
        elementFor("a", opts.components),
        { key, href, title: node.title ?? void 0 },
        ...renderChildren(node, opts)
      );
    }
    case "image": {
      const src = sanitizeUrl(node.url);
      if (src === void 0) return node.alt ? createElement(Fragment, { key }, node.alt) : null;
      return createElement(elementFor("img", opts.components), {
        key,
        src,
        alt: node.alt ?? "",
        title: node.title ?? void 0
      });
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

// src/SafeContent.tsx
function SafeContent({ source, fallback = null, ...options }) {
  const [tree, setTree] = useState(null);
  const runId = useRef(0);
  useEffect(() => {
    const id = ++runId.current;
    setTree(null);
    let cancelled = false;
    parseSafeMdast(source).then((parsed) => {
      if (!cancelled && runId.current === id) setTree(parsed);
    }).catch(() => {
      if (!cancelled && runId.current === id) setTree(null);
    });
    return () => {
      cancelled = true;
    };
  }, [source]);
  const rendered = useMemo(
    () => tree ? renderMdast(tree, options) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tree, options.components, options.resolveWikiLink]
  );
  return tree ? rendered : fallback;
}
export {
  SafeContent,
  parseSafeMdast,
  parseWikiInner,
  renderMdast,
  sanitizeUrl,
  splitWikiLinks
};
