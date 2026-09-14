var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// node_modules/@immediately-run/mdx-plugins/dist/index.js
var dist_exports = {};
__export(dist_exports, {
  FS_PREFIX: () => FS_PREFIX,
  LINK_SPACE_FIXTURE: () => LINK_SPACE_FIXTURE,
  SLUG_PARITY_FIXTURE: () => SLUG_PARITY_FIXTURE,
  headingId: () => headingId,
  isContentEntryFile: () => isContentEntryFile,
  isContentEntryPath: () => isContentEntryPath,
  normalizeAbsolute: () => normalizeAbsolute,
  parseFrontmatter: () => parseFrontmatter,
  remarkAdmonitions: () => remarkAdmonitions_default,
  remarkHeadingAnchors: () => remarkHeadingAnchors_default,
  remarkWikiLinks: () => remarkWikiLinks_default,
  resolveLinkTarget: () => resolveLinkTarget,
  sectionId: () => sectionId,
  textSlug: () => textSlug
});
function textSlug(text) {
  return text.trim().toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}
var LEADING_TOKEN = /^([A-Za-z0-9]+(?:\.[A-Za-z0-9]+)*)/;
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
var remarkHeadingAnchors = (options = {}) => (tree) => {
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
var remarkHeadingAnchors_default = remarkHeadingAnchors;
var SLUG_PARITY_FIXTURE = [
  {
    text: "Getting started",
    slug: "getting-started",
    section: null,
    id: "getting-started",
    idWithoutSections: "getting-started",
    why: "the ordinary prose heading"
  },
  {
    text: "8. Capability model",
    slug: "8-capability-model",
    section: "sec-8",
    id: "sec-8",
    idWithoutSections: "8-capability-model",
    why: "a whole-number section \u2014 the id must NOT be the prose slug"
  },
  {
    text: "8.9 Powerbox",
    slug: "89-powerbox",
    section: "sec-8-9",
    id: "sec-8-9",
    idWithoutSections: "89-powerbox",
    why: "dotted section: dots become hyphens in the id and VANISH from the slug"
  },
  {
    text: "8.9 Renamed entirely",
    slug: "89-renamed-entirely",
    section: "sec-8-9",
    id: "sec-8-9",
    idWithoutSections: "89-renamed-entirely",
    why: "prose-independence: the citation target survives a retitle"
  },
  {
    text: "7A. Filesystem trust mode",
    slug: "7a-filesystem-trust-mode",
    section: "sec-7a",
    id: "sec-7a",
    idWithoutSections: "7a-filesystem-trust-mode",
    why: "letter-suffixed section number"
  },
  {
    text: "A.0 Branding",
    slug: "a0-branding",
    section: "sec-a-0",
    id: "sec-a-0",
    idWithoutSections: "a0-branding",
    why: "appendix form: leading LETTER is section-like only with the dot"
  },
  {
    text: "Decisions & rejected alternatives",
    slug: "decisions-rejected-alternatives",
    section: null,
    id: "decisions-rejected-alternatives",
    idWithoutSections: "decisions-rejected-alternatives",
    why: "`&` is dropped, and its surrounding spaces do not leave a double hyphen"
  },
  {
    text: "R\xE9sum\xE9 \u2014 the caf\xE9 case",
    slug: "rsum-the-caf-case",
    section: null,
    id: "rsum-the-caf-case",
    idWithoutSections: "rsum-the-caf-case",
    why: 'ASCII-only `\\w`: accented letters are DROPPED, not transliterated (`R\xE9sum\xE9` \u2192 `rsum`), and the em-dash leaves a hyphen run that then COLLAPSES to one. Ugly, and the byte-canon \u2014 a consumer that "fixed" either half would silently unlink every citation to such a heading'
  },
  {
    text: "\u65E5\u672C\u8A9E\u306E\u898B\u51FA\u3057",
    slug: "",
    section: null,
    id: "section",
    idWithoutSections: "section",
    why: "a fully non-ASCII heading slugs to EMPTY and falls back to `section`"
  },
  {
    text: "?!?",
    slug: "",
    section: null,
    id: "section",
    idWithoutSections: "section",
    why: "punctuation-only heading: same empty-slug fallback, reached a different way"
  },
  {
    text: "  Leading and trailing   spaces  ",
    slug: "leading-and-trailing-spaces",
    section: null,
    id: "leading-and-trailing-spaces",
    idWithoutSections: "leading-and-trailing-spaces",
    why: "whitespace runs collapse to ONE hyphen; the ends are trimmed"
  },
  {
    text: "snake_case and kebab-case",
    slug: "snake_case-and-kebab-case",
    section: null,
    id: "snake_case-and-kebab-case",
    idWithoutSections: "snake_case-and-kebab-case",
    why: "underscore is a word char and SURVIVES; an existing hyphen is kept"
  },
  {
    text: "1a First",
    slug: "1a-first",
    section: "sec-1a",
    id: "sec-1a",
    idWithoutSections: "1a-first",
    why: "digit-then-letter token, no dot \u2014 still section-like"
  },
  {
    text: "v2 roadmap",
    slug: "v2-roadmap",
    section: "sec-v2",
    id: "sec-v2",
    idWithoutSections: "v2-roadmap",
    why: 'the grammar is positional, not semantic: `v2` contains a digit in its first component, so it IS section-like. A consumer that special-cased "looks like a version" would diverge here'
  },
  {
    text: "3.2.1 Something",
    slug: "321-something",
    section: "sec-3-2-1",
    id: "sec-3-2-1",
    idWithoutSections: "321-something",
    why: "three dotted components"
  }
];
var LINK_SPACE_FIXTURE = [
  {
    raw: "docs.mdx",
    currentFile: "/app/content/home.mdx",
    corpusRoot: "/app/content",
    expect: { state: "resolved", path: "/app/content/docs.mdx" },
    why: "relative \u2014 the form an author actually writes, resolved against the authoring file"
  },
  {
    raw: "home.mdx",
    currentFile: "/app/content/home.mdx",
    corpusRoot: "/app/content",
    expect: { state: "resolved", path: "/app/content/home.mdx" },
    why: "self \u2014 resolution names the authoring file itself; self-ness is the caller\u2019s judgement"
  },
  {
    raw: "../specs/A.mdx",
    currentFile: "/app/content/home.mdx",
    corpusRoot: "/app/content",
    expect: { state: "resolved", path: "/app/specs/A.mdx" },
    why: "relative may leave the corpus \u2014 the fs spaces are shared; existence checks decide link fate"
  },
  {
    raw: "./sub/../docs.mdx",
    currentFile: "/app/content/home.mdx",
    corpusRoot: "/app/content",
    expect: { state: "resolved", path: "/app/content/docs.mdx" },
    why: "dot segments collapse before anything else"
  },
  {
    raw: "/roadmap/index.mdx",
    currentFile: "/app/content/home.mdx",
    corpusRoot: "/app/content",
    expect: { state: "resolved", path: "/app/content/roadmap/index.mdx" },
    why: "corpus-absolute \u2014 anchored at the declared corpus root"
  },
  {
    raw: "/../escape.mdx",
    currentFile: "/app/content/home.mdx",
    corpusRoot: "/app/content",
    expect: { state: "resolved", path: "/app/content/escape.mdx" },
    why: "the corpus space is CLOSED under traversal \u2014 `..` clamps inside the root, never climbs out"
  },
  {
    raw: "/index.mdx",
    currentFile: "/app/outer/a.mdx",
    corpusRoot: "/app/outer/wiki/nested",
    expect: { state: "resolved", path: "/app/outer/wiki/nested/index.mdx" },
    why: "nested corpus \u2014 the INNERMOST enclosing root wins (bundle encapsulation)"
  },
  {
    raw: "/src/App.tsx",
    currentFile: "/src/main.tsx",
    corpusRoot: null,
    expect: { state: "resolved", path: "/src/App.tsx" },
    why: "a non-corpus app declares nothing: absolute stays fs-rooted, bit-for-bit"
  },
  {
    raw: "$fs:/package.json",
    currentFile: "/app/content/home.mdx",
    corpusRoot: "/app/content",
    expect: { state: "resolved", path: "/package.json" },
    why: "$fs: \u2014 the explicit filesystem space, escaping corpus-relative addressing"
  },
  {
    raw: "$fs:/content/docs.mdx",
    currentFile: "/bundle/content/home.mdx",
    corpusRoot: "/bundle",
    bundleChrooted: true,
    expect: { state: "resolved", path: "/bundle/content/docs.mdx" },
    why: "under a bundle chroot $fs: collapses to the scoped root \u2014 the two spellings name one space"
  },
  {
    raw: "$fs:javascript:alert(1)",
    currentFile: "/app/content/home.mdx",
    corpusRoot: "/app/content",
    expect: { state: "invalid" },
    why: "scheme smuggling through $fs: is INVALID \u2014 renders broken, never an anchor"
  },
  {
    raw: "$fs:content/docs.mdx",
    currentFile: "/app/content/home.mdx",
    corpusRoot: "/app/content",
    expect: { state: "invalid" },
    why: "a relative $fs: target is malformed \u2014 $fs: is mount-absolute or nothing"
  },
  {
    raw: "docs.mdx",
    corpusRoot: "/app/content",
    expect: { state: "unresolvable" },
    why: "relative with no known authoring file \u2014 the caller may route optimistically"
  }
];
var FS_PREFIX = "$fs:";
var normalizeAbsolute = (path) => {
  const out = [];
  for (const seg of path.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return "/" + out.join("/");
};
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
function stripQuotes(s) {
  if (s.startsWith('"') && s.endsWith('"') || s.startsWith("'") && s.endsWith("'")) {
    return s.slice(1, -1);
  }
  return s;
}
function parseScalarOrList(rawVal) {
  if (rawVal.startsWith("[") && rawVal.endsWith("]")) {
    const inner = rawVal.slice(1, -1).trim();
    return inner === "" ? [] : inner.split(",").map((s) => stripQuotes(s.trim()));
  }
  return stripQuotes(rawVal);
}
function parseFrontmatter(content) {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") return { data: {}, body: content, hadFrontmatter: false };
  const end = lines.indexOf("---", 1);
  if (end === -1) return { data: {}, body: content, hadFrontmatter: false };
  const fmLines = lines.slice(1, end);
  const body = lines.slice(end + 1).join("\n").replace(/^\n+/, "");
  const data = {};
  let key = null;
  for (const line of fmLines) {
    if (/^\s+-\s+/.test(line) && key !== null) {
      const item = stripQuotes(line.replace(/^\s*-\s+/, "").trim());
      if (!Array.isArray(data[key])) data[key] = [];
      data[key].push(item);
      continue;
    }
    const sub = line.match(/^\s+([A-Za-z0-9_-]+):\s*(.*)$/);
    if (sub && key !== null) {
      const cur = data[key];
      if (typeof cur !== "object" || cur === null || Array.isArray(cur)) data[key] = {};
      data[key][sub[1]] = parseScalarOrList(sub[2].trim());
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    key = kv[1];
    const rawVal = kv[2].trim();
    if (rawVal === "") {
      data[key] = null;
    } else if (rawVal === "{}") {
      data[key] = {};
      key = null;
    } else if (rawVal.startsWith("[") && rawVal.endsWith("]")) {
      data[key] = parseScalarOrList(rawVal);
    } else {
      data[key] = stripQuotes(rawVal);
      key = null;
    }
  }
  return { data, body, hadFrontmatter: true };
}
function isContentEntryFile(fileName) {
  if (!/\.mdx?$/.test(fileName)) return false;
  return !fileName.startsWith("_");
}
function isContentEntryPath(path) {
  return isContentEntryFile(path.split("/").pop() ?? "");
}
var WIKILINK = /\[\[([^[\]]+)\]\]/g;
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
var remarkWikiLinks = () => (tree) => {
  walk(tree);
};
var remarkWikiLinks_default = remarkWikiLinks;
var MARKER = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(\r?\n|$)/i;
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
var remarkAdmonitions = () => (tree) => {
  walk2(tree);
};
var remarkAdmonitions_default = remarkAdmonitions;

// inline-mdx-plugins.js
var __m = void 0 ?? dist_exports;
var FS_PREFIX2 = __m["FS_PREFIX"];
var LINK_SPACE_FIXTURE2 = __m["LINK_SPACE_FIXTURE"];
var SLUG_PARITY_FIXTURE2 = __m["SLUG_PARITY_FIXTURE"];
var headingId2 = __m["headingId"];
var isContentEntryFile2 = __m["isContentEntryFile"];
var isContentEntryPath2 = __m["isContentEntryPath"];
var normalizeAbsolute2 = __m["normalizeAbsolute"];
var parseFrontmatter2 = __m["parseFrontmatter"];
var remarkAdmonitions2 = __m["remarkAdmonitions"];
var remarkHeadingAnchors2 = __m["remarkHeadingAnchors"];
var remarkWikiLinks2 = __m["remarkWikiLinks"];
var resolveLinkTarget2 = __m["resolveLinkTarget"];
var sectionId2 = __m["sectionId"];
var textSlug2 = __m["textSlug"];
export {
  FS_PREFIX2 as FS_PREFIX,
  LINK_SPACE_FIXTURE2 as LINK_SPACE_FIXTURE,
  SLUG_PARITY_FIXTURE2 as SLUG_PARITY_FIXTURE,
  headingId2 as headingId,
  isContentEntryFile2 as isContentEntryFile,
  isContentEntryPath2 as isContentEntryPath,
  normalizeAbsolute2 as normalizeAbsolute,
  parseFrontmatter2 as parseFrontmatter,
  remarkAdmonitions2 as remarkAdmonitions,
  remarkHeadingAnchors2 as remarkHeadingAnchors,
  remarkWikiLinks2 as remarkWikiLinks,
  resolveLinkTarget2 as resolveLinkTarget,
  sectionId2 as sectionId,
  textSlug2 as textSlug
};
