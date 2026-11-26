import "./chunk-VHAA22YE.js";
import { PROSE_TOKENS } from "./proseStyles.js";
const PROSE_TOKEN_FILE = "immediately.run.css";
const PROSE_MARKER_FILE = "immediately.run.json";
const PROSE_TOKEN_FILE_MAX_BYTES = 16384;
const PROSE_TOKEN_VALUE_MAX_LENGTH = 256;
const ALLOWED = new Set(PROSE_TOKENS.map((token) => `--${token.name}`));
const REFUSED_VALUE_FRAGMENTS = [
  "url(",
  "image(",
  "image-set(",
  "cross-fade(",
  "element(",
  "src(",
  "@",
  "\\",
  ";",
  "{",
  "}",
  "<",
  ">"
];
const SELECTORS = {
  ":root": "root",
  ':root[data-theme="light"]': "light",
  ':root[data-theme="dark"]': "dark"
};
const blockFor = (selector) => SELECTORS[selector.replace(/\s+/g, "").replace(/'/g, '"')] ?? null;
const refusedFragment = (value) => {
  const lower = value.toLowerCase();
  return REFUSED_VALUE_FRAGMENTS.find((fragment) => lower.includes(fragment));
};
const byteLength = (text) => new TextEncoder().encode(text).length;
const splitBlocks = (text) => {
  const blocks = [];
  let buffer = "";
  let current = null;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      if (end < 0) return "an unterminated comment";
      i = end + 2;
      buffer += " ";
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== ch) {
        if (text[j] === "\\") j += 1;
        if (text[j] === "\n") return "an unterminated string";
        j += 1;
      }
      if (j >= text.length) return "an unterminated string";
      buffer += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === "{") {
      if (current) return "a nested block";
      current = { selector: buffer.trim(), declarations: [] };
      buffer = "";
    } else if (ch === "}") {
      if (!current) return 'an unmatched "}"';
      if (buffer.trim()) current.declarations.push(buffer.trim());
      blocks.push(current);
      current = null;
      buffer = "";
    } else if (ch === ";" && current) {
      if (buffer.trim()) current.declarations.push(buffer.trim());
      buffer = "";
    } else {
      buffer += ch;
    }
    i += 1;
  }
  if (current) return "an unclosed block";
  if (buffer.trim()) return `"${buffer.trim().slice(0, 40)}" outside a block`;
  return blocks;
};
function parseProseTokenFile(text) {
  if (byteLength(text) > PROSE_TOKEN_FILE_MAX_BYTES) {
    return { ok: false, reason: `it is larger than ${PROSE_TOKEN_FILE_MAX_BYTES} bytes` };
  }
  const split = splitBlocks(text);
  if (typeof split === "string") return { ok: false, reason: `it contains ${split}` };
  const blocks = { root: {}, light: {}, dark: {} };
  const warnings = [];
  for (const { selector, declarations } of split) {
    const block = blockFor(selector);
    if (!block) {
      return {
        ok: false,
        reason: `"${selector.slice(0, 60)}" is not one of :root, :root[data-theme="light"], :root[data-theme="dark"]`
      };
    }
    for (const declaration of declarations) {
      const match = /^(--[A-Za-z0-9_-]+)\s*:([\s\S]*)$/.exec(declaration);
      if (!match) {
        return { ok: false, reason: `"${declaration.slice(0, 60)}" is not a custom property declaration` };
      }
      const name = match[1];
      const value = match[2].trim();
      if (!ALLOWED.has(name)) {
        warnings.push(`${name} is not a prose token; ignored`);
        continue;
      }
      if (!value) {
        warnings.push(`${name} has an empty value; ignored`);
        continue;
      }
      if (value.length > PROSE_TOKEN_VALUE_MAX_LENGTH) {
        warnings.push(`${name} is longer than ${PROSE_TOKEN_VALUE_MAX_LENGTH} characters; ignored`);
        continue;
      }
      const fragment = refusedFragment(value);
      if (fragment) {
        warnings.push(`${name} contains "${fragment}"; ignored`);
        continue;
      }
      blocks[block][name] = value;
    }
  }
  return { ok: true, blocks, warnings };
}
function tokensFor(blocks, polarity) {
  return Object.entries({ ...blocks.root, ...blocks[polarity] });
}
const join = (dir, name) => dir ? `${dir}/${name}` : name;
const parentOf = (dir) => dir === "" ? null : dir.includes("/") ? dir.slice(0, dir.lastIndexOf("/")) : "";
const dirOfFile = (file) => {
  const clean = file.replace(/^\/+/, "");
  return clean.includes("/") ? clean.slice(0, clean.lastIndexOf("/")) : "";
};
const resolveStyles = (dir, styles) => {
  if (styles.startsWith("/")) return { reason: `"styles": "${styles}" is absolute` };
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(styles)) return { reason: `"styles": "${styles}" names a URL` };
  const parts = [];
  for (const segment of styles.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") return { reason: `"styles": "${styles}" leaves the directory of its marker` };
    parts.push(segment);
  }
  if (!parts.length) return { reason: `"styles": "${styles}" names no file` };
  return { path: join(dir, parts.join("/")) };
};
async function resolveTokenFile(startDir, probe) {
  const warnings = [];
  for (let dir = startDir.replace(/^\/+|\/+$/g, ""); dir !== null; dir = parentOf(dir)) {
    const markerPath = join(dir, PROSE_MARKER_FILE);
    const defaultPath = join(dir, PROSE_TOKEN_FILE);
    const [markerText, defaultSize] = await Promise.all([probe.read(markerPath), probe.size(defaultPath)]);
    if (markerText === null && defaultSize === null) continue;
    let styles;
    if (markerText !== null) {
      try {
        const marker = JSON.parse(markerText);
        styles = marker && typeof marker === "object" ? marker.styles : void 0;
      } catch {
        warnings.push(`${markerPath} is not valid JSON; its "styles" field is ignored`);
      }
      if (styles !== void 0 && styles !== false && typeof styles !== "string") {
        warnings.push(`${markerPath}: "styles" must be a file name or false; ignored`);
        styles = void 0;
      }
    }
    if (styles === false) return { path: null, size: null, watch: null, dir, warnings };
    if (typeof styles === "string") {
      const resolved = resolveStyles(dir, styles);
      if ("reason" in resolved) {
        warnings.push(`${markerPath}: ${resolved.reason}; author tokens are off`);
        return { path: null, size: null, watch: null, dir, warnings };
      }
      const size = await probe.size(resolved.path);
      if (size === null) warnings.push(`${markerPath}: "styles" names ${resolved.path}, which does not exist`);
      return { path: size === null ? null : resolved.path, size, watch: resolved.path, dir, warnings };
    }
    const path = defaultSize === null ? null : defaultPath;
    return { path, size: defaultSize, watch: path, dir, warnings };
  }
  return { path: null, size: null, watch: null, dir: "", warnings };
}
function affectsTokenLookup(changed, startDir, watched) {
  const path = changed.replace(/^\/+/, "");
  if (watched !== null && path === watched) return true;
  const name = path.slice(path.lastIndexOf("/") + 1);
  if (name !== PROSE_MARKER_FILE && name !== PROSE_TOKEN_FILE) return false;
  const dir = dirOfFile(path);
  const start = startDir.replace(/^\/+|\/+$/g, "");
  return dir === "" || start === dir || start.startsWith(`${dir}/`);
}
export {
  PROSE_MARKER_FILE,
  PROSE_TOKEN_FILE,
  PROSE_TOKEN_FILE_MAX_BYTES,
  PROSE_TOKEN_VALUE_MAX_LENGTH,
  affectsTokenLookup,
  dirOfFile,
  parseProseTokenFile,
  resolveTokenFile,
  tokensFor
};
//# sourceMappingURL=proseTokens.js.map