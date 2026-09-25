var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// node_modules/@immediately-run/mdx-plugins/dist/index.js
var dist_exports = {};
__export(dist_exports, {
  BUNDLE_LAYOUT_FIXTURE: () => BUNDLE_LAYOUT_FIXTURE,
  FS_PREFIX: () => FS_PREFIX,
  INLINE_PROSE_FIXTURE: () => INLINE_PROSE_FIXTURE,
  LAYOUT_GRAMMAR_VERSION: () => LAYOUT_GRAMMAR_VERSION,
  LAYOUT_LIMITS: () => LAYOUT_LIMITS,
  LINK_SPACE_FIXTURE: () => LINK_SPACE_FIXTURE,
  SLUG_PARITY_FIXTURE: () => SLUG_PARITY_FIXTURE,
  headingId: () => headingId,
  isContentEntryFile: () => isContentEntryFile,
  isContentEntryPath: () => isContentEntryPath,
  normalizeAbsolute: () => normalizeAbsolute,
  parseBundleLayout: () => parseBundleLayout,
  parseFrontmatter: () => parseFrontmatter,
  parseInlineProse: () => parseInlineProse,
  plainProse: () => plainProse,
  pruneLayoutToView: () => pruneLayoutToView,
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
  },
  {
    raw: "/specs/A.mdx",
    currentFile: "/app/content/home.mdx",
    bundleRoot: "/app/content",
    expect: { state: "resolved", path: "/app/content/specs/A.mdx" },
    why: "R3-482 \u2014 the NEW spelling anchors an absolute link exactly as `corpusRoot` did"
  },
  {
    raw: "/specs/A.mdx",
    currentFile: "/app/content/home.mdx",
    bundleRoot: "/app/content",
    corpusRoot: "/app/STALE",
    expect: { state: "resolved", path: "/app/content/specs/A.mdx" },
    why: "R3-482 \u2014 new-then-old: when both are stated the NEW name wins, never the old"
  },
  {
    raw: "/specs/A.mdx",
    currentFile: "/app/content/home.mdx",
    bundleRoot: null,
    corpusRoot: "/app/STALE",
    expect: { state: "resolved", path: "/specs/A.mdx" },
    why: 'R3-482 \u2014 an explicit `bundleRoot: null` is a VALUE ("no bundle root"), not "absent", so it does NOT fall back to a stale `corpusRoot`. This is the case `bundleRoot ?? corpusRoot` gets wrong, and it would anchor every absolute link at the wrong directory.'
  },
  {
    raw: "$fs:/x.mdx",
    currentFile: "/mnt/h/home.mdx",
    bundleRoot: "/mnt/h",
    bundleChrooted: true,
    expect: { state: "resolved", path: "/mnt/h/x.mdx" },
    why: "R3-482 \u2014 the chroot collapse reads the new spelling too, not only the `/p` branch"
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
var statedBundleRoot = (opts) => opts.bundleRoot !== void 0 ? opts.bundleRoot : opts.corpusRoot ?? null;
function resolveCorpusAbsolute(path, corpusRoot) {
  const inner = normalizeAbsolute(path);
  if (corpusRoot === null || corpusRoot === "/") return { state: "resolved", path: inner };
  return { state: "resolved", path: normalizeAbsolute(corpusRoot + inner) };
}
function resolveLinkTarget(raw, opts = {}) {
  if (raw.startsWith(FS_PREFIX)) {
    const rest = raw.slice(FS_PREFIX.length);
    if (!rest.startsWith("/")) return { state: "invalid" };
    if (opts.bundleChrooted) return resolveCorpusAbsolute(rest, statedBundleRoot(opts));
    return { state: "resolved", path: normalizeAbsolute(rest) };
  }
  if (raw.startsWith("/")) {
    const corpusRoot = statedBundleRoot(opts);
    if (corpusRoot !== null) {
      return resolveCorpusAbsolute(raw, corpusRoot);
    }
    return { state: "resolved", path: normalizeAbsolute(raw) };
  }
  if (!opts.currentFile) return { state: "unresolvable" };
  const dir = opts.currentFile.slice(0, opts.currentFile.lastIndexOf("/"));
  return { state: "resolved", path: normalizeAbsolute(`${dir}/${raw}`) };
}
var DOUBLE_QUOTED_ESCAPES = {
  "0": "\0",
  a: "\x07",
  b: "\b",
  t: "	",
  "	": "	",
  n: "\n",
  v: "\v",
  f: "\f",
  r: "\r",
  e: "\x1B",
  " ": " ",
  '"': '"',
  "/": "/",
  "\\": "\\",
  N: "\x85",
  _: "\xA0",
  L: "\u2028",
  P: "\u2029"
};
var HEX_ESCAPE_DIGITS = { x: 2, u: 4, U: 8 };
function hexEscape(s, at) {
  const digits = HEX_ESCAPE_DIGITS[s[at]];
  if (digits === void 0) return null;
  const raw = s.slice(at + 1, at + 1 + digits);
  if (raw.length !== digits || !/^[0-9a-fA-F]+$/.test(raw)) return null;
  const cp = parseInt(raw, 16);
  if (cp > 1114111) return null;
  return { value: String.fromCodePoint(cp), length: 1 + digits };
}
function unescapeDoubleQuoted(s) {
  if (!s.includes("\\")) return s;
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== "\\" || i + 1 >= s.length) {
      out += s[i];
      continue;
    }
    const next = s[i + 1];
    const hex = hexEscape(s, i + 1);
    if (hex) {
      out += hex.value;
      i += hex.length;
    } else if (Object.prototype.hasOwnProperty.call(DOUBLE_QUOTED_ESCAPES, next)) {
      out += DOUBLE_QUOTED_ESCAPES[next];
      i += 1;
    } else {
      out += s[i];
    }
  }
  return out;
}
function stripQuotes(s) {
  if (s.length >= 2) {
    if (s.startsWith('"') && s.endsWith('"')) return unescapeDoubleQuoted(s.slice(1, -1));
    if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
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
var LAYOUT_GRAMMAR_VERSION = 1;
var LAYOUT_LIMITS = {
  recordSets: 64,
  treeEntries: 256,
  uniqueFanOut: 32,
  selectGlobLength: 256,
  wellKnownNames: 16
};
var isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var RESERVED_KEYS = /* @__PURE__ */ new Set(["__proto__", "constructor", "prototype"]);
var safeKey = (name) => typeof name === "string" && name.length > 0 && !name.includes("\0") && !RESERVED_KEYS.has(name);
var cleanBundlePath = (p) => {
  if (typeof p !== "string" || !p.startsWith("/")) return false;
  if (p.includes("\\") || p.includes("\0")) return false;
  let inner = p.slice(1);
  if (inner.endsWith("/")) inner = inner.slice(0, -1);
  return inner.split("/").every((seg) => seg !== "" && seg !== "." && seg !== "..");
};
var cleanSelect = (s) => typeof s === "string" && s.length > 0 && !s.includes("/") && !s.includes("\\") && !s.includes("..") && !s.includes("\0");
var isReserved = (name) => typeof name === "string" && RESERVED_KEYS.has(name);
function validateFromPath(from, path, badCode, diagnostics) {
  if (typeof from !== "string" || from.length === 0 || from.includes("\0")) {
    diagnostics.push(diag(badCode, path, "from must be a non-empty string"));
    return null;
  }
  const segments = from.split(".");
  if (segments.some(isReserved)) {
    diagnostics.push(diag("reserved-key", path, "a `from` segment is a reserved key"));
    return null;
  }
  if (segments.some((seg) => seg === "")) {
    diagnostics.push(diag(badCode, path, "`from` segments must be non-empty"));
    return null;
  }
  return from;
}
var MEDIA_TOKEN = /^[a-z0-9][a-z0-9!#$&^_.+-]*$/;
var isMediaType = (t) => {
  if (typeof t !== "string") return false;
  const slash = t.indexOf("/");
  if (slash === -1 || slash !== t.lastIndexOf("/")) return false;
  return MEDIA_TOKEN.test(t.slice(0, slash)) && MEDIA_TOKEN.test(t.slice(slash + 1));
};
var RECORD_GRAMMARS = /* @__PURE__ */ new Set(["mdx-frontmatter", "json-file", "opaque"]);
var WELL_KNOWN_FIELDS = /* @__PURE__ */ new Set(["title", "body", "status", "order", "labels", "date", "summary"]);
var OPAQUE_WELL_KNOWN_SOURCES = /* @__PURE__ */ new Set(["filename", "mtime", "size"]);
var diag = (code, path, message) => ({
  code,
  path,
  message
});
function parseWellKnownField(name, value, path, diagnostics) {
  if (typeof value === "string") {
    if (validateFromPath(value, path, "bad-well-known", diagnostics) === null) return null;
    return { from: value };
  }
  if (!isObject(value)) {
    diagnostics.push(diag("bad-well-known", path, "wellKnown field must be a `from` string or object"));
    return null;
  }
  const fromPath = validateFromPath(value.from, `${path}.from`, "bad-well-known", diagnostics);
  if (fromPath === null) return null;
  const out = { from: fromPath };
  if ("values" in value) {
    if (name !== "status") {
      diagnostics.push(diag("bad-well-known", `${path}.values`, "`values` belongs to the status field only"));
      return null;
    }
    const values = value.values;
    if (!Array.isArray(values) || !values.every((x) => typeof x === "string")) {
      diagnostics.push(diag("bad-well-known", `${path}.values`, "status values must be an array of strings"));
      return null;
    }
    out.values = values.slice();
  }
  if ("terminal" in value) {
    if (name !== "status") {
      diagnostics.push(diag("bad-well-known", `${path}.terminal`, "`terminal` belongs to the status field only"));
      return null;
    }
    const terminal = value.terminal;
    if (!isObject(terminal)) {
      diagnostics.push(diag("bad-well-known", `${path}.terminal`, "terminal must be an object"));
      return null;
    }
    if (typeof terminal.value !== "string") {
      diagnostics.push(diag("bad-well-known", `${path}.terminal.value`, "terminal.value must be a string"));
      return null;
    }
    if (isReserved(terminal.movesTo)) {
      diagnostics.push(diag("reserved-key", `${path}.terminal.movesTo`, "terminal.movesTo is a reserved key"));
      return null;
    }
    if (typeof terminal.movesTo !== "string" || !safeKey(terminal.movesTo)) {
      diagnostics.push(diag("bad-well-known", `${path}.terminal.movesTo`, "terminal.movesTo must be a safe record-set name"));
      return null;
    }
    out.terminal = { value: terminal.value, movesTo: terminal.movesTo };
  }
  if ("meaning" in value) {
    if (name !== "order") {
      diagnostics.push(diag("bad-well-known", `${path}.meaning`, "`meaning` belongs to the order field only"));
      return null;
    }
    const meaning = value.meaning;
    if (meaning !== "execution" && meaning !== "display") {
      diagnostics.push(diag("bad-well-known", `${path}.meaning`, "order meaning must be `execution` or `display`"));
      return null;
    }
    out.meaning = meaning;
  }
  return out;
}
function parseRecordSet(value, path, diagnostics) {
  if (!isObject(value)) {
    diagnostics.push(diag("bad-record-set", path, "record set must be an object"));
    return null;
  }
  if (!cleanBundlePath(value.dir)) {
    diagnostics.push(
      diag("bad-dir", `${path}.dir`, "dir must be a bundle-absolute, normalized path (no .., NUL or backslash)")
    );
    return null;
  }
  const out = { dir: normalizeAbsolute(value.dir) };
  if (value.select === void 0) {
    diagnostics.push(diag("missing-select", `${path}.select`, "a record set must declare a select glob"));
    return null;
  }
  if (!cleanSelect(value.select)) {
    diagnostics.push(
      diag("bad-select", `${path}.select`, "select must be a basename glob with no separator, .. or NUL")
    );
    return null;
  }
  out.select = value.select;
  if (value.recursive !== void 0) {
    if (typeof value.recursive !== "boolean") {
      diagnostics.push(diag("bad-recursive", `${path}.recursive`, "recursive must be a boolean"));
      return null;
    }
    out.recursive = value.recursive;
  }
  let record = value.record;
  if (record !== void 0) {
    if (typeof record !== "string" || !RECORD_GRAMMARS.has(record)) {
      diagnostics.push(
        diag("bad-record", `${path}.record`, "record must be one of mdx-frontmatter | json-file | opaque")
      );
      return null;
    }
  }
  let mediaTypes;
  if (value.mediaType !== void 0) {
    const list = Array.isArray(value.mediaType) ? value.mediaType : [value.mediaType];
    if (list.length === 0 || !list.every(isMediaType)) {
      diagnostics.push(
        diag("bad-media-type", `${path}.mediaType`, "mediaType must be a lowercase RFC 6838 type/subtype pair")
      );
      return null;
    }
    mediaTypes = list;
    if (record === void 0) record = "opaque";
  }
  if (value.schema !== void 0) {
    if (record === "opaque") {
      diagnostics.push(
        diag("schema-on-opaque", `${path}.schema`, "schema is refused on a mediaType-only (opaque) record set")
      );
      return null;
    }
    if (typeof value.schema !== "string" || value.schema.startsWith(FS_PREFIX) || !cleanBundlePath(value.schema)) {
      diagnostics.push(
        diag("bad-schema", `${path}.schema`, "schema must be a bundle-relative path (never $fs:)")
      );
      return null;
    }
    out.schema = normalizeAbsolute(value.schema);
  }
  if (record === void 0 && mediaTypes === void 0) {
    diagnostics.push(
      diag(
        "missing-record",
        path,
        "a record set must declare record or mediaType \u2014 the grammar that makes a file a record"
      )
    );
    return null;
  }
  if (record !== void 0) out.record = record;
  if (mediaTypes !== void 0) out.mediaType = mediaTypes.length === 1 ? mediaTypes[0] : mediaTypes.slice();
  if (value.id !== void 0) {
    const id = value.id;
    if (!isObject(id)) {
      diagnostics.push(diag("bad-id", `${path}.id`, "id must be { from }"));
      return null;
    }
    const idFrom = validateFromPath(id.from, `${path}.id.from`, "bad-id", diagnostics);
    if (idFrom === null) return null;
    out.id = { from: idFrom };
  }
  if (value.unique !== void 0) {
    if (!Array.isArray(value.unique)) {
      diagnostics.push(diag("bad-unique", `${path}.unique`, "unique must be an array of record-set names"));
      return null;
    }
    for (const u of value.unique) {
      if (isReserved(u)) {
        diagnostics.push(diag("reserved-key", `${path}.unique`, "a unique entry is a reserved key"));
        return null;
      }
      if (!safeKey(u)) {
        diagnostics.push(diag("bad-unique", `${path}.unique`, "unique entries must be safe record-set names"));
        return null;
      }
    }
    out.unique = value.unique.slice();
  }
  if (value.wellKnown !== void 0) {
    if (!isObject(value.wellKnown)) {
      diagnostics.push(diag("bad-well-known", `${path}.wellKnown`, "wellKnown must be an object"));
      return null;
    }
    const wellKnown = /* @__PURE__ */ Object.create(null);
    const isOpaque = record === "opaque";
    for (const name of Object.keys(value.wellKnown)) {
      if (isReserved(name)) {
        diagnostics.push(diag("reserved-key", `${path}.wellKnown`, `wellKnown name ${JSON.stringify(name)} is reserved`));
        return null;
      }
      if (!WELL_KNOWN_FIELDS.has(name)) {
        diagnostics.push(
          diag("bad-well-known", `${path}.wellKnown`, `wellKnown name ${JSON.stringify(name)} is not in the closed vocabulary`)
        );
        return null;
      }
      const field = parseWellKnownField(name, value.wellKnown[name], `${path}.wellKnown.${name}`, diagnostics);
      if (field === null) return null;
      if (isOpaque && !OPAQUE_WELL_KNOWN_SOURCES.has(field.from)) {
        diagnostics.push(
          diag("bad-well-known", `${path}.wellKnown.${name}`, "on an opaque record set a wellKnown field may only name filename/mtime/size")
        );
        return null;
      }
      wellKnown[name] = field;
    }
    out.wellKnown = wellKnown;
  }
  if (value.writable !== void 0) {
    if (!Array.isArray(value.writable) || !value.writable.every((x) => typeof x === "string" && !x.includes("\0"))) {
      diagnostics.push(diag("bad-writable", `${path}.writable`, "writable must be an array of strings"));
      return null;
    }
    out.writable = value.writable.slice();
  }
  if (value.frozen !== void 0) {
    if (typeof value.frozen !== "boolean") {
      diagnostics.push(diag("bad-frozen", `${path}.frozen`, "frozen must be a boolean"));
      return null;
    }
    out.frozen = value.frozen;
  }
  return out;
}
function parseBundleLayout(json) {
  const diagnostics = [];
  if (!isObject(json)) {
    return { layout: null, diagnostics: [diag("layout-not-object", "", "layout must be an object")] };
  }
  if (json.version !== LAYOUT_GRAMMAR_VERSION) {
    return {
      layout: null,
      diagnostics: [diag("unsupported-version", "version", `unsupported layout grammar version ${String(json.version)}`)]
    };
  }
  if (json.recordSets === void 0 && json.layoutFrom === void 0) {
    return {
      layout: null,
      diagnostics: [diag("missing-record-sets", "", "layout must declare recordSets or layoutFrom")]
    };
  }
  const layout = { version: LAYOUT_GRAMMAR_VERSION, recordSets: /* @__PURE__ */ Object.create(null) };
  if (json.recordSets !== void 0) {
    if (!isObject(json.recordSets)) {
      return {
        layout: null,
        diagnostics: [diag("record-sets-not-object", "recordSets", "recordSets must be an object")]
      };
    }
    const names = Object.keys(json.recordSets);
    if (names.length > LAYOUT_LIMITS.recordSets) {
      return {
        layout: null,
        diagnostics: [
          diag(
            "limit-record-sets",
            "recordSets",
            `recordSets has ${names.length} entries; the bound is ${LAYOUT_LIMITS.recordSets}`
          )
        ]
      };
    }
    for (const name of names) {
      if (!safeKey(name)) continue;
      const raw = json.recordSets[name];
      if (!isObject(raw)) continue;
      if (typeof raw.select === "string" && raw.select.length > LAYOUT_LIMITS.selectGlobLength) {
        return {
          layout: null,
          diagnostics: [
            diag(
              "limit-select-glob",
              `recordSets.${name}.select`,
              `select glob is ${raw.select.length} characters; the bound is ${LAYOUT_LIMITS.selectGlobLength}`
            )
          ]
        };
      }
      if (Array.isArray(raw.unique) && raw.unique.length > LAYOUT_LIMITS.uniqueFanOut) {
        return {
          layout: null,
          diagnostics: [
            diag(
              "limit-unique",
              `recordSets.${name}.unique`,
              `unique names ${raw.unique.length} record sets; the bound is ${LAYOUT_LIMITS.uniqueFanOut}`
            )
          ]
        };
      }
      if (isObject(raw.wellKnown) && Object.keys(raw.wellKnown).length > LAYOUT_LIMITS.wellKnownNames) {
        return {
          layout: null,
          diagnostics: [
            diag(
              "limit-well-known",
              `recordSets.${name}.wellKnown`,
              `wellKnown has ${Object.keys(raw.wellKnown).length} fields; the bound is ${LAYOUT_LIMITS.wellKnownNames}`
            )
          ]
        };
      }
    }
    for (const name of names) {
      if (!safeKey(name)) {
        diagnostics.push(
          diag(
            isReserved(name) ? "reserved-key" : "bad-record-set",
            "recordSets",
            `record-set name ${JSON.stringify(name)} is ${isReserved(name) ? "reserved" : "not a safe key"}`
          )
        );
        continue;
      }
      const parsed = parseRecordSet(json.recordSets[name], `recordSets.${name}`, diagnostics);
      if (parsed) layout.recordSets[name] = parsed;
    }
  }
  if (json.tree !== void 0) {
    if (!isObject(json.tree)) {
      diagnostics.push(diag("bad-tree", "tree", "tree must be an object"));
    } else {
      const paths = Object.keys(json.tree);
      if (paths.length > LAYOUT_LIMITS.treeEntries) {
        return {
          layout: null,
          diagnostics: [
            diag("limit-tree-entries", "tree", `tree has ${paths.length} entries; the bound is ${LAYOUT_LIMITS.treeEntries}`)
          ]
        };
      }
      const tree = /* @__PURE__ */ Object.create(null);
      for (const path of paths) {
        const entry = json.tree[path];
        if (!cleanBundlePath(path)) {
          diagnostics.push(diag("bad-tree", `tree[${JSON.stringify(path)}]`, "tree path must be a bundle-absolute, normalized path"));
          continue;
        }
        if (!isObject(entry)) {
          diagnostics.push(diag("bad-tree-entry", `tree[${JSON.stringify(path)}]`, "tree entry must be an object"));
          continue;
        }
        const out = {};
        if ("purpose" in entry) {
          if (typeof entry.purpose !== "string") {
            diagnostics.push(diag("bad-tree-entry", `tree[${JSON.stringify(path)}].purpose`, "purpose must be a string"));
            continue;
          }
          out.purpose = entry.purpose;
        }
        if ("bundle" in entry) {
          if (typeof entry.bundle !== "boolean") {
            diagnostics.push(diag("bad-tree-entry", `tree[${JSON.stringify(path)}].bundle`, "bundle must be a boolean"));
            continue;
          }
          out.bundle = entry.bundle;
        }
        tree[normalizeAbsolute(path)] = out;
      }
      layout.tree = tree;
    }
  }
  if (json.layoutFrom !== void 0) {
    if (json.recordSets !== void 0 || json.tree !== void 0) {
      diagnostics.push(
        diag("layout-from-conflict", "layoutFrom", "layoutFrom is instead-of an own recordSets/tree block (\xA74a.1), not beside one")
      );
    } else {
      const layoutFrom = json.layoutFrom;
      if (!isObject(layoutFrom) || typeof layoutFrom.app !== "string" || typeof layoutFrom.commit !== "string" || layoutFrom.app.includes("@")) {
        diagnostics.push(
          diag("bad-layout-from", "layoutFrom", "layoutFrom must be { app (revision-less), commit }")
        );
      } else {
        layout.layoutFrom = { app: layoutFrom.app, commit: layoutFrom.commit };
      }
    }
  }
  return { layout, diagnostics };
}
var inView = (path, view) => view === "/" || path === view || path.startsWith(view + "/");
function pruneLayoutToView(layout, subtree) {
  const view = normalizeAbsolute(subtree);
  const recordSets = /* @__PURE__ */ Object.create(null);
  const prunedOut = /* @__PURE__ */ new Set();
  for (const [name, rs] of Object.entries(layout.recordSets)) {
    if (inView(rs.dir, view)) recordSets[name] = rs;
    else prunedOut.add(name);
  }
  for (const name of Object.keys(recordSets)) {
    const rs = recordSets[name];
    if (rs.unique) {
      const kept = rs.unique.filter((u) => !prunedOut.has(u));
      if (kept.length !== rs.unique.length) {
        const { unique: _dropped, ...rest } = rs;
        void _dropped;
        recordSets[name] = kept.length ? { ...rs, unique: kept } : rest;
      }
    }
  }
  const pruned = { version: layout.version, recordSets };
  if (layout.tree) {
    const tree = /* @__PURE__ */ Object.create(null);
    for (const [path, entry] of Object.entries(layout.tree)) {
      if (inView(path, view)) tree[path] = entry;
    }
    pruned.tree = tree;
  }
  if (layout.layoutFrom && view === "/") pruned.layoutFrom = layout.layoutFrom;
  return pruned;
}
var wikiLayout = {
  version: 1,
  recordSets: {
    "roadmap-items": {
      dir: "/roadmap",
      select: "R3-*.mdx",
      record: "mdx-frontmatter",
      schema: "/roadmap/item.schema.json",
      id: { from: "filename" },
      unique: ["roadmap-archive"],
      wellKnown: {
        title: "frontmatter.title",
        status: {
          from: "frontmatter.status",
          values: ["available", "in-progress", "in-review", "deferred", "deprioritized", "superseded"],
          terminal: { value: "done", movesTo: "roadmap-archive" }
        },
        order: { from: "frontmatter.order", meaning: "execution" },
        body: "content"
      },
      writable: []
    },
    "roadmap-archive": {
      dir: "/roadmap/archive",
      select: "R3-*.mdx",
      record: "mdx-frontmatter",
      schema: "/roadmap/item.schema.json",
      id: { from: "filename" },
      frozen: true
    },
    figures: {
      dir: "/specs/figures",
      select: "*.png",
      mediaType: "image/png",
      id: { from: "filename" }
    }
  },
  tree: {
    "/roadmap": { purpose: "the live engineering roadmap, one file per work item" },
    "/roadmap/archive": { purpose: "done items, moved here by the owner's tooling" },
    "/roadmap/board": { purpose: "the kanban view of /roadmap", bundle: true },
    "/specs": { purpose: "one spec per area" },
    "/context": { purpose: "the resident context set and the routed documents" }
  }
};
var limits = LAYOUT_LIMITS;
var limitCases = () => {
  const recordSets = {};
  for (let i = 0; i < limits.recordSets + 1; i++) recordSets[`set${i}`] = { dir: `/d${i}`, select: "*", record: "opaque" };
  const tree = {};
  for (let i = 0; i < limits.treeEntries + 1; i++) tree[`/t${i}`] = { purpose: "x" };
  const unique = Array.from({ length: limits.uniqueFanOut + 1 }, (_, i) => `s${i}`);
  const wellKnown = {};
  for (let i = 0; i < limits.wellKnownNames + 1; i++) wellKnown[`k${i}`] = "frontmatter.title";
  return [
    {
      name: "limit: record sets",
      layout: { version: 1, recordSets },
      accept: false,
      diagnostics: ["limit-record-sets"],
      why: "\xA74a.5 \u2014 more record sets than the bound refuses the whole block"
    },
    {
      name: "limit: tree entries",
      layout: { version: 1, recordSets: {}, tree },
      accept: false,
      diagnostics: ["limit-tree-entries"],
      why: "\xA74a.5 \u2014 more tree entries than the bound refuses the whole block"
    },
    {
      name: "limit: select glob length",
      layout: {
        version: 1,
        recordSets: { a: { dir: "/a", select: "x".repeat(limits.selectGlobLength + 1), record: "opaque" } }
      },
      accept: false,
      diagnostics: ["limit-select-glob"],
      why: "\xA74a.5 \u2014 a select glob longer than the bound refuses the whole block"
    },
    {
      name: "limit: unique fan-out",
      layout: { version: 1, recordSets: { a: { dir: "/a", select: "*", record: "opaque", unique } } },
      accept: false,
      diagnostics: ["limit-unique"],
      why: "\xA74a.5 \u2014 more unique references than the bound refuses the whole block"
    },
    {
      name: "limit: wellKnown names",
      layout: { version: 1, recordSets: { a: { dir: "/a", select: "*.mdx", record: "mdx-frontmatter", wellKnown } } },
      accept: false,
      diagnostics: ["limit-well-known"],
      why: "\xA74a.5 \u2014 more wellKnown fields than the bound refuses the whole block"
    }
  ];
};
var BUNDLE_LAYOUT_FIXTURE = [
  {
    name: "wiki layout (\xA74a.1)",
    layout: wikiLayout,
    accept: true,
    diagnostics: [],
    why: "the real producer \u2014 the wiki\u2019s own declaration parses with no diagnostics"
  },
  {
    name: "mediaType list accepted; schema+structured record accepted",
    layout: {
      version: 1,
      recordSets: {
        figures: { dir: "/figures", select: "*.{png,jpg}", mediaType: ["image/png", "image/jpeg"] },
        manifests: { dir: "/m", select: "*.json", record: "json-file", mediaType: "application/json", schema: "/m/x.schema.json" }
      }
    },
    accept: true,
    diagnostics: [],
    why: "a list of media types, and mediaType beside a structured record (permitted and redundant), both accept"
  },
  {
    name: "layoutFrom adopts an owner-pinned default",
    layout: { version: 1, layoutFrom: { app: "github:immediately-run/grove", commit: "0123abc" } },
    accept: true,
    diagnostics: [],
    why: "the \xA74a.1 alternative \u2014 a provider default instead of an own recordSets/tree block"
  },
  {
    name: 'unknown version degrades to "no layout"',
    layout: { version: 2, recordSets: {} },
    accept: false,
    diagnostics: ["unsupported-version"],
    why: "\xA74a.5 \u2014 a grammar the parser does not know is refused whole, the bundle still opens"
  },
  {
    name: "not an object",
    layout: "layout",
    accept: false,
    diagnostics: ["layout-not-object"],
    why: "a non-object layout is malformed"
  },
  {
    name: "neither recordSets nor layoutFrom",
    layout: { version: 1 },
    accept: false,
    diagnostics: ["missing-record-sets"],
    why: "a layout that declares nothing is malformed"
  },
  {
    name: "recordSets not an object",
    layout: { version: 1, recordSets: "roadmap" },
    accept: false,
    diagnostics: ["record-sets-not-object"],
    why: "recordSets must be an object"
  },
  {
    name: "layoutFrom and recordSets are mutually exclusive",
    layout: { version: 1, recordSets: { a: { dir: "/a", select: "*", record: "opaque" } }, layoutFrom: { app: "github:immediately-run/grove", commit: "0123abc" } },
    accept: true,
    diagnostics: ["layout-from-conflict"],
    why: '\xA74a.1 \u2014 layoutFrom is "instead of" an own block; a recordSets wins and layoutFrom is dropped'
  },
  {
    name: "layoutFrom and tree are mutually exclusive",
    layout: { version: 1, tree: { "/roadmap": { purpose: "x" } }, layoutFrom: { app: "github:immediately-run/grove", commit: "0123abc" } },
    accept: true,
    diagnostics: ["layout-from-conflict"],
    why: '\xA74a.1 \u2014 layoutFrom is "instead of" an own recordSets/tree block; a tree alone triggers the same conflict'
  },
  {
    name: "a trailing slash on a dir is a clamp, not a refusal",
    layout: { version: 1, recordSets: { roadmap: { dir: "/roadmap/", select: "R3-*.mdx", record: "opaque", mediaType: "text/md" } }, tree: { "/roadmap/": { purpose: "x" } } },
    accept: true,
    diagnostics: [],
    why: "dir/tree tolerate one trailing slash (the spec \xA73 `at: '/items/'` spelling) and normalize it away \u2014 the one accept-and-normalize clamp in the grammar"
  },
  {
    name: "layoutFrom with a revision refused",
    layout: { version: 1, layoutFrom: { app: "github:immediately-run/grove@main", commit: "0123abc" } },
    accept: true,
    diagnostics: ["bad-layout-from"],
    why: "layoutFrom.app is a revision-less identity; the revision lives in commit (\xA74a.1)"
  },
  {
    name: "reserved record-set name is dropped, the rest survive",
    layout: JSON.parse(
      '{"version":1,"recordSets":{"__proto__":{"dir":"/x","select":"*","record":"opaque"},"ok":{"dir":"/y","select":"*","record":"opaque"}}}'
    ),
    accept: true,
    diagnostics: ["reserved-key"],
    why: "\xA74a.5 key hygiene \u2014 `__proto__` as a record-set name refuses that set, the block still parses"
  },
  {
    name: "reserved wellKnown name refuses",
    layout: JSON.parse(
      '{"version":1,"recordSets":{"roadmap":{"dir":"/roadmap","select":"R3-*.mdx","record":"mdx-frontmatter","wellKnown":{"__proto__":"frontmatter.title"}}}}'
    ),
    accept: true,
    diagnostics: ["reserved-key"],
    why: "a `__proto__` wellKnown key is refused"
  },
  {
    name: "reserved `from` segment refuses",
    layout: JSON.parse(
      '{"version":1,"recordSets":{"roadmap":{"dir":"/roadmap","select":"R3-*.mdx","record":"mdx-frontmatter","id":{"from":"frontmatter.__proto__"}}}}'
    ),
    accept: true,
    diagnostics: ["reserved-key"],
    why: "a `from` path whose segment is `__proto__` is refused"
  },
  {
    name: "reserved record-set name `constructor` refuses",
    layout: JSON.parse(
      '{"version":1,"recordSets":{"constructor":{"dir":"/x","select":"*","record":"opaque","mediaType":"image/png"},"ok":{"dir":"/y","select":"*","record":"opaque","mediaType":"image/png"}}}'
    ),
    accept: true,
    diagnostics: ["reserved-key"],
    why: "\xA74a.5 \u2014 `constructor` in the record-set namespace is refused (the whole RESERVED_KEYS class, not only __proto__)"
  },
  {
    name: "reserved record-set name `prototype` refuses",
    layout: JSON.parse(
      '{"version":1,"recordSets":{"prototype":{"dir":"/x","select":"*","record":"opaque","mediaType":"image/png"}}}'
    ),
    accept: true,
    diagnostics: ["reserved-key"],
    why: "\xA74a.5 \u2014 `prototype` in the record-set namespace is refused"
  },
  {
    name: "the full closed wellKnown vocabulary accepts",
    layout: {
      version: 1,
      recordSets: {
        docs: {
          dir: "/docs",
          select: "*.mdx",
          record: "mdx-frontmatter",
          schema: "/docs/doc.schema.json",
          wellKnown: {
            title: "frontmatter.title",
            body: "content",
            status: { from: "frontmatter.status", values: ["draft", "published"] },
            order: { from: "frontmatter.order", meaning: "display" },
            labels: "frontmatter.tags",
            date: "frontmatter.date",
            summary: "frontmatter.summary"
          }
        }
      }
    },
    accept: true,
    diagnostics: [],
    why: "\xA74a.1 \u2014 every one of the seven well-known names parses (labels/date/summary are input here, not just favourites)"
  },
  {
    name: "schema $fs: refused",
    layout: {
      version: 1,
      recordSets: { roadmap: { dir: "/roadmap", select: "R3-*.mdx", record: "mdx-frontmatter", schema: "$fs:/x.json" } }
    },
    accept: true,
    diagnostics: ["bad-schema"],
    why: "\xA74a.1 \u2014 a schema MUST be bundle-intrinsic; `$fs:` is refused here"
  },
  {
    name: "schema on a mediaType-only (opaque) record set refused",
    layout: {
      version: 1,
      recordSets: { figures: { dir: "/figures", select: "*.png", mediaType: "image/png", schema: "/f.schema.json" } }
    },
    accept: true,
    diagnostics: ["schema-on-opaque"],
    why: "schema on an opaque record set is a refusal diagnostic (\xA74a.1)"
  },
  {
    name: "bad mediaType refused (uppercase + parameters)",
    layout: { version: 1, recordSets: { figures: { dir: "/figures", select: "*.png", mediaType: "Image/PNG; q=1" } } },
    accept: true,
    diagnostics: ["bad-media-type"],
    why: "\xA74a.1 \u2014 lowercase RFC 6838 token pair only, no parameters, no registry lookup"
  },
  {
    name: "bad directory refused (traversal)",
    layout: { version: 1, recordSets: { roadmap: { dir: "/../escape", select: "*", record: "opaque" } } },
    accept: true,
    diagnostics: ["bad-dir"],
    why: "a `dir` with `..` is refused, not clamped \u2014 a layout is a description"
  },
  {
    name: "bad select refused (separator)",
    layout: { version: 1, recordSets: { roadmap: { dir: "/roadmap", select: "../*.mdx", record: "mdx-frontmatter" } } },
    accept: true,
    diagnostics: ["bad-select"],
    why: "select is a non-recursive basename glob \u2014 separators and `..` are refused"
  },
  {
    name: "bad record grammar refused",
    layout: { version: 1, recordSets: { roadmap: { dir: "/roadmap", select: "R3-*.mdx", record: "yaml" } } },
    accept: true,
    diagnostics: ["bad-record"],
    why: "record must be one of the closed set"
  },
  {
    name: "a wellKnown name outside the closed vocabulary is refused",
    layout: JSON.parse(
      '{"version":1,"recordSets":{"roadmap":{"dir":"/roadmap","select":"R3-*.mdx","record":"mdx-frontmatter","wellKnown":{"banana":"frontmatter.title"}}}}'
    ),
    accept: true,
    diagnostics: ["bad-well-known"],
    why: "\xA74a.1 \u2014 wellKnown is a closed vocabulary; an unknown name is refused"
  },
  {
    name: "wellKnown structure on the wrong field is refused",
    layout: JSON.parse(
      '{"version":1,"recordSets":{"roadmap":{"dir":"/roadmap","select":"R3-*.mdx","record":"mdx-frontmatter","wellKnown":{"title":{"from":"frontmatter.title","values":["a"]}}}}}'
    ),
    accept: true,
    diagnostics: ["bad-well-known"],
    why: "`values`/`terminal` belong to status only, `meaning` to order only"
  },
  {
    name: "an opaque record set may only name filename/mtime/size in wellKnown",
    layout: {
      version: 1,
      recordSets: {
        figures: { dir: "/figures", select: "*.png", mediaType: "image/png", wellKnown: { title: "frontmatter.title" } }
      }
    },
    accept: true,
    diagnostics: ["bad-well-known"],
    why: "\xA74a.1 \u2014 there is no record to read on an opaque set, so the source is filename/mtime/size"
  },
  {
    name: "missing select refused",
    layout: { version: 1, recordSets: { roadmap: { dir: "/roadmap", record: "mdx-frontmatter" } } },
    accept: true,
    diagnostics: ["missing-select"],
    why: "\xA74a.1 \u2014 a record set is a directory plus a select glob"
  },
  {
    name: "missing record grammar (record/mediaType) refused",
    layout: { version: 1, recordSets: { roadmap: { dir: "/roadmap", select: "R3-*.mdx" } } },
    accept: true,
    diagnostics: ["missing-record"],
    why: "\xA74a.1 \u2014 a record set must declare record or mediaType; neither means the block does not say what a record is"
  },
  {
    name: "a schema alone names no grammar",
    layout: { version: 1, recordSets: { roadmap: { dir: "/roadmap", select: "R3-*.mdx", schema: "/roadmap/item.schema.json" } } },
    accept: true,
    diagnostics: ["missing-record"],
    why: "a schema with no record grammar is refused \u2014 the consumer could not choose mdx-frontmatter vs json-file"
  },
  {
    name: "record set value not an object",
    layout: { version: 1, recordSets: { a: 42 } },
    accept: true,
    diagnostics: ["bad-record-set"],
    why: "a record set entry must be an object"
  },
  {
    name: "bad recursive refused",
    layout: { version: 1, recordSets: { a: { dir: "/a", select: "*.mdx", record: "mdx-frontmatter", recursive: "yes" } } },
    accept: true,
    diagnostics: ["bad-recursive"],
    why: "recursive must be a boolean"
  },
  {
    name: "bad id refused",
    layout: { version: 1, recordSets: { a: { dir: "/a", select: "*.mdx", record: "mdx-frontmatter", id: { from: 42 } } } },
    accept: true,
    diagnostics: ["bad-id"],
    why: "id.from must be a safe `from` path"
  },
  {
    name: "bad unique refused",
    layout: { version: 1, recordSets: { a: { dir: "/a", select: "*.mdx", record: "mdx-frontmatter", unique: "roadmap-archive" } } },
    accept: true,
    diagnostics: ["bad-unique"],
    why: "unique must be an array of safe record-set names"
  },
  {
    name: "bad wellKnown (not an object) refused",
    layout: { version: 1, recordSets: { a: { dir: "/a", select: "*.mdx", record: "mdx-frontmatter", wellKnown: "title" } } },
    accept: true,
    diagnostics: ["bad-well-known"],
    why: "wellKnown must be an object"
  },
  {
    name: "bad writable refused",
    layout: { version: 1, recordSets: { a: { dir: "/a", select: "*.mdx", record: "mdx-frontmatter", writable: "status" } } },
    accept: true,
    diagnostics: ["bad-writable"],
    why: "writable must be an array of strings"
  },
  {
    name: "bad frozen refused",
    layout: { version: 1, recordSets: { a: { dir: "/a", select: "*.mdx", record: "mdx-frontmatter", frozen: "yes" } } },
    accept: true,
    diagnostics: ["bad-frozen"],
    why: "frozen must be a boolean"
  },
  {
    name: "tree not an object",
    layout: { version: 1, recordSets: {}, tree: "roadmap" },
    accept: true,
    diagnostics: ["bad-tree"],
    why: "tree must be an object"
  },
  {
    name: "bad tree entry refused",
    layout: { version: 1, recordSets: {}, tree: { "/roadmap": "purpose" } },
    accept: true,
    diagnostics: ["bad-tree-entry"],
    why: "each tree entry must be an object"
  },
  ...limitCases()
];
var isWhitespace = (ch) => ch !== void 0 && /\s/u.test(ch);
var isPunctuation = (ch) => ch !== void 0 && /[\p{P}\p{S}]/u.test(ch);
function classify(ch) {
  if (ch === void 0 || isWhitespace(ch)) return 1;
  if (ch.codePointAt(0) > 65535) return void 0;
  if (isPunctuation(ch)) return 2;
  return void 0;
}
function tokenize(s) {
  const chars = [...s];
  const tokens = [];
  let textStart = 0;
  let i = 0;
  const flushText = (end) => {
    if (textStart < end) tokens.push({ kind: "text", value: chars.slice(textStart, end).join("") });
  };
  while (i < chars.length) {
    const ch = chars[i];
    if (ch === "\\" && i + 1 < chars.length && /[\x21-\x2F\x3A-\x40\x5B-\x60\x7B-\x7E]/.test(chars[i + 1])) {
      flushText(i);
      tokens.push({ kind: "text", value: chars[i + 1] });
      i += 2;
      textStart = i;
      continue;
    }
    if (ch === "`") {
      const openStart = i;
      while (i < chars.length && chars[i] === "`") i++;
      const runLen = i - openStart;
      let j = i;
      let closeStart = -1;
      while (j < chars.length) {
        if (chars[j] === "`") {
          const runStart = j;
          while (j < chars.length && chars[j] === "`") j++;
          if (j - runStart === runLen) {
            closeStart = runStart;
            break;
          }
        } else {
          j++;
        }
      }
      if (closeStart !== -1) {
        flushText(openStart);
        let content = chars.slice(i, closeStart).join("");
        if (content.length >= 2 && content.startsWith(" ") && content.endsWith(" ") && /[^ ]/.test(content)) {
          content = content.slice(1, -1);
        }
        tokens.push({ kind: "code", value: content });
        i = closeStart + runLen;
        textStart = i;
      }
      continue;
    }
    if (ch === "*" || ch === "_") {
      const runStart = i;
      while (i < chars.length && chars[i] === ch) i++;
      flushText(runStart);
      const before = classify(runStart > 0 ? chars[runStart - 1] : void 0);
      const after = classify(i < chars.length ? chars[i] : void 0);
      const beforeRaw = runStart > 0 ? chars[runStart - 1] : void 0;
      const afterRaw = i < chars.length ? chars[i] : void 0;
      const isMarker = (c) => c === "*" || c === "_";
      const open = after === void 0 || after === 2 && before !== void 0 || isMarker(afterRaw);
      const close = before === void 0 || before === 2 && after !== void 0 || isMarker(beforeRaw);
      tokens.push({
        kind: "del",
        ch,
        count: i - runStart,
        canOpen: ch === "*" ? open : open && (before !== void 0 || !close),
        canClose: ch === "*" ? close : close && (after !== void 0 || !open)
      });
      textStart = i;
      continue;
    }
    i++;
  }
  flushText(chars.length);
  return tokens;
}
function resolveAttention(tokens) {
  const nodes = [...tokens];
  let c = 0;
  while (c < nodes.length) {
    const closer = nodes[c];
    if (closer.kind !== "del" || !closer.canClose) {
      c++;
      continue;
    }
    let matched = false;
    for (let o = c - 1; o >= 0; o--) {
      const opener = nodes[o];
      if (opener.kind !== "del" || !opener.canOpen || opener.ch !== closer.ch) continue;
      if ((opener.canClose || closer.canOpen) && closer.count % 3 !== 0 && (opener.count + closer.count) % 3 === 0) {
        continue;
      }
      const use = opener.count > 1 && closer.count > 1 ? 2 : 1;
      const inner = toProse(resolveAttention(nodes.slice(o + 1, c)));
      const group = {
        kind: "group",
        group: use > 1 ? { type: "strong", children: inner } : { type: "emphasis", children: inner }
      };
      const next = [];
      if (opener.count - use > 0) next.push({ ...opener, count: opener.count - use });
      next.push(group);
      if (closer.count - use > 0) next.push({ ...closer, count: closer.count - use });
      nodes.splice(o, c - o + 1, ...next);
      c = o + (opener.count - use > 0 ? 1 : 0) + 1;
      matched = true;
      break;
    }
    if (!matched) c++;
  }
  return nodes;
}
function toProse(tokens) {
  const out = [];
  for (const t of tokens) {
    if (t.kind === "group") out.push(t.group);
    else if (t.kind === "text") out.push({ type: "text", value: t.value });
    else if (t.kind === "code") out.push({ type: "code", value: t.value });
    else out.push({ type: "text", value: t.ch.repeat(t.count) });
  }
  const merged = [];
  for (const n of out) {
    const last = merged[merged.length - 1];
    if (n.type === "text" && last?.type === "text") last.value += n.value;
    else merged.push(n);
  }
  return merged;
}
function parseInlineProse(s) {
  if (typeof s !== "string") throw new TypeError("parseInlineProse: expected a string");
  if (s === "") return [];
  return toProse(resolveAttention(tokenize(s)));
}
function plainProse(s) {
  const walk3 = (nodes) => nodes.map((n) => n.type === "strong" || n.type === "emphasis" ? walk3(n.children) : n.value).join("");
  return walk3(parseInlineProse(s));
}
var INLINE_PROSE_FIXTURE = [
  {
    text: "Run `npm test` to check.",
    tokens: [{ type: "text", value: "Run " }, { type: "code", value: "npm test" }, { type: "text", value: " to check." }],
    plain: "Run npm test to check.",
    why: "the ordinary code span in a title"
  },
  {
    text: "a ``x ` y`` b",
    tokens: [{ type: "text", value: "a " }, { type: "code", value: "x ` y" }, { type: "text", value: " b" }],
    plain: "a x ` y b",
    why: "a run of two closes only on a run of two; the inner single backtick is content"
  },
  {
    text: "a `` pad `` b",
    tokens: [{ type: "text", value: "a " }, { type: "code", value: "pad" }, { type: "text", value: " b" }],
    plain: "a pad b",
    why: "one leading and one trailing space are stripped when both are present"
  },
  {
    text: "**Hold** the line.",
    tokens: [{ type: "strong", children: [{ type: "text", value: "Hold" }] }, { type: "text", value: " the line." }],
    plain: "Hold the line.",
    why: "strong"
  },
  {
    text: "Speak *softly*.",
    tokens: [{ type: "text", value: "Speak " }, { type: "emphasis", children: [{ type: "text", value: "softly" }] }, { type: "text", value: "." }],
    plain: "Speak softly.",
    why: "emphasis with asterisks"
  },
  {
    text: "Use _underscores_ too.",
    tokens: [{ type: "text", value: "Use " }, { type: "emphasis", children: [{ type: "text", value: "underscores" }] }, { type: "text", value: " too." }],
    plain: "Use underscores too.",
    why: "emphasis with underscores"
  },
  {
    text: "**bold and *nested* more**",
    tokens: [
      {
        type: "strong",
        children: [
          { type: "text", value: "bold and " },
          { type: "emphasis", children: [{ type: "text", value: "nested" }] },
          { type: "text", value: " more" }
        ]
      }
    ],
    plain: "bold and nested more",
    why: "emphasis nested inside strong \u2014 the recursion the flat regex gets wrong"
  },
  {
    text: "a ` b",
    tokens: [{ type: "text", value: "a ` b" }],
    plain: "a ` b",
    why: "an unbalanced backtick run is literal text, never an empty code element"
  },
  {
    text: "foo_bar_baz",
    tokens: [{ type: "text", value: "foo_bar_baz" }],
    plain: "foo_bar_baz",
    why: "the CommonMark intraword rule: `_` between alphanumerics is not a delimiter"
  },
  {
    text: "a * b",
    tokens: [{ type: "text", value: "a * b" }],
    plain: "a * b",
    why: "a space-padded asterisk is neither left- nor right-flanking, so literal"
  },
  {
    text: "a*'foo'*b",
    tokens: [{ type: "text", value: "a*'foo'*b" }],
    plain: "a*'foo'*b",
    why: "a delimiter followed by punctuation and preceded by a plain char cannot open (round-1 review, R1)"
  },
  {
    text: "a*(foo)*b",
    tokens: [{ type: "text", value: "a*(foo)*b" }],
    plain: "a*(foo)*b",
    why: "same flanking failure with round brackets"
  },
  {
    text: "*(foo)*a",
    tokens: [{ type: "text", value: "*(foo)*a" }],
    plain: "*(foo)*a",
    why: "the closer sits between punctuation and a plain char, so it cannot close"
  },
  {
    text: "x*(y)*z",
    tokens: [{ type: "text", value: "x*(y)*z" }],
    plain: "x*(y)*z",
    why: "both runs are punctuation-flanked on the plain side only \u2014 literal"
  },
  {
    text: "\u0437\u0438\u043C\u0430_\u0432\u0435\u0441\u043D\u0430_\u043B\u0435\u0442\u043E",
    tokens: [{ type: "text", value: "\u0437\u0438\u043C\u0430_\u0432\u0435\u0441\u043D\u0430_\u043B\u0435\u0442\u043E" }],
    plain: "\u0437\u0438\u043C\u0430_\u0432\u0435\u0441\u043D\u0430_\u043B\u0435\u0442\u043E",
    why: "the intraword `_` restriction is UNICODE-alphanumeric, not ASCII \u2014 a Cyrillic letter blocks the run (round-1 review, R1)"
  },
  {
    text: "**a***",
    tokens: [
      { type: "strong", children: [{ type: "text", value: "a" }] },
      { type: "text", value: "*" }
    ],
    plain: "a*",
    why: "a closer longer than the opener matches two markers and leaves its remainder literal (round-1 review, R1)"
  },
  {
    text: "***a***",
    tokens: [
      {
        type: "emphasis",
        children: [{ type: "strong", children: [{ type: "text", value: "a" }] }]
      }
    ],
    plain: "a",
    why: "the triple runs resolve as emphasis-wrapped strong via the leftover halves (round-1 review, R1)"
  },
  {
    text: "*`a`*",
    tokens: [
      {
        type: "emphasis",
        children: [{ type: "code", value: "a" }]
      }
    ],
    plain: "a",
    why: "emphasis SPANS a code span \u2014 segmenting code spans before emphasis cannot see this (round-1 review, R1)"
  },
  {
    text: "5*6*7",
    tokens: [
      { type: "text", value: "5" },
      { type: "emphasis", children: [{ type: "text", value: "6" }] },
      { type: "text", value: "7" }
    ],
    plain: "567",
    why: "digit-wrapped single asterisks DO emphasize on the real renderer \u2014 pinned as measured, not as the spec paragraph was remembered"
  },
  {
    text: "*a `b` c*",
    tokens: [
      {
        type: "emphasis",
        children: [
          { type: "text", value: "a " },
          { type: "code", value: "b" },
          { type: "text", value: " c" }
        ]
      }
    ],
    plain: "a b c",
    why: "the general emphasis-across-code-span shape the per-segment parser could not build"
  },
  {
    text: "a*\u{1F600}*b",
    tokens: [
      { type: "text", value: "a" },
      { type: "emphasis", children: [{ type: "text", value: "\u{1F600}" }] },
      { type: "text", value: "b" }
    ],
    plain: "a\u{1F600}b",
    why: "an astral char is PLAIN to the renderer (it classifies UTF-16 units; surrogates are category Cs) \u2014 the run flanks normally (round-2 review)"
  },
  {
    text: "a \\*b\\* c",
    tokens: [{ type: "text", value: "a *b* c" }],
    plain: "a *b* c",
    why: "a backslash-escaped marker is literal and keeps no backslash \u2014 it never opens or closes (round-2 review)"
  },
  {
    text: "` 	 `",
    tokens: [{ type: "code", value: "	" }],
    plain: "	",
    why: "the code-span strip excludes only SPACE; a tab is content, not padding (round-2 review)"
  },
  {
    text: "",
    tokens: [],
    plain: "",
    why: "the empty field"
  },
  {
    text: "plain prose, no markers.",
    tokens: [{ type: "text", value: "plain prose, no markers." }],
    plain: "plain prose, no markers.",
    why: "the no-marker string \u2014 the overwhelmingly common case, one text node"
  },
  {
    text: "R3-410 \u2014 `cache.yml` self-provisioning fails on every fresh org repo \u2014 widen the deploy-App secrets",
    tokens: [
      { type: "text", value: "R3-410 \u2014 " },
      { type: "code", value: "cache.yml" },
      { type: "text", value: " self-provisioning fails on every fresh org repo \u2014 widen the deploy-App secrets" }
    ],
    plain: "R3-410 \u2014 cache.yml self-provisioning fails on every fresh org repo \u2014 widen the deploy-App secrets",
    why: "the REAL title that surfaced the defect, verbatim from content/roadmap/R3-410.mdx"
  }
];
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
var BUNDLE_LAYOUT_FIXTURE2 = __m["BUNDLE_LAYOUT_FIXTURE"];
var FS_PREFIX2 = __m["FS_PREFIX"];
var INLINE_PROSE_FIXTURE2 = __m["INLINE_PROSE_FIXTURE"];
var LAYOUT_GRAMMAR_VERSION2 = __m["LAYOUT_GRAMMAR_VERSION"];
var LAYOUT_LIMITS2 = __m["LAYOUT_LIMITS"];
var LINK_SPACE_FIXTURE2 = __m["LINK_SPACE_FIXTURE"];
var SLUG_PARITY_FIXTURE2 = __m["SLUG_PARITY_FIXTURE"];
var headingId2 = __m["headingId"];
var isContentEntryFile2 = __m["isContentEntryFile"];
var isContentEntryPath2 = __m["isContentEntryPath"];
var normalizeAbsolute2 = __m["normalizeAbsolute"];
var parseBundleLayout2 = __m["parseBundleLayout"];
var parseFrontmatter2 = __m["parseFrontmatter"];
var parseInlineProse2 = __m["parseInlineProse"];
var plainProse2 = __m["plainProse"];
var pruneLayoutToView2 = __m["pruneLayoutToView"];
var remarkAdmonitions2 = __m["remarkAdmonitions"];
var remarkHeadingAnchors2 = __m["remarkHeadingAnchors"];
var remarkWikiLinks2 = __m["remarkWikiLinks"];
var resolveLinkTarget2 = __m["resolveLinkTarget"];
var sectionId2 = __m["sectionId"];
var textSlug2 = __m["textSlug"];
export {
  BUNDLE_LAYOUT_FIXTURE2 as BUNDLE_LAYOUT_FIXTURE,
  FS_PREFIX2 as FS_PREFIX,
  INLINE_PROSE_FIXTURE2 as INLINE_PROSE_FIXTURE,
  LAYOUT_GRAMMAR_VERSION2 as LAYOUT_GRAMMAR_VERSION,
  LAYOUT_LIMITS2 as LAYOUT_LIMITS,
  LINK_SPACE_FIXTURE2 as LINK_SPACE_FIXTURE,
  SLUG_PARITY_FIXTURE2 as SLUG_PARITY_FIXTURE,
  headingId2 as headingId,
  isContentEntryFile2 as isContentEntryFile,
  isContentEntryPath2 as isContentEntryPath,
  normalizeAbsolute2 as normalizeAbsolute,
  parseBundleLayout2 as parseBundleLayout,
  parseFrontmatter2 as parseFrontmatter,
  parseInlineProse2 as parseInlineProse,
  plainProse2 as plainProse,
  pruneLayoutToView2 as pruneLayoutToView,
  remarkAdmonitions2 as remarkAdmonitions,
  remarkHeadingAnchors2 as remarkHeadingAnchors,
  remarkWikiLinks2 as remarkWikiLinks,
  resolveLinkTarget2 as resolveLinkTarget,
  sectionId2 as sectionId,
  textSlug2 as textSlug
};
