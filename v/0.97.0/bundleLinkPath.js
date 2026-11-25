import "./chunk-VHAA22YE.js";
import { FS_PREFIX } from "./_workspace/mdx-plugins.js";
const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const ENCODED_DOT_SEGMENT = /^(?:\.|%2e){1,2}$/i;
const hasControlChar = (s) => {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 32 || c === 127) return true;
  }
  return false;
};
const hasLoneSurrogate = (s) => {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 55296 && c <= 56319) {
      const next = s.charCodeAt(i + 1);
      if (next >= 56320 && next <= 57343) i++;
      else return true;
    } else if (c >= 56320 && c <= 57343) return true;
  }
  return false;
};
const segmentRefusal = (raw) => {
  let s;
  try {
    s = decodeURIComponent(raw);
  } catch {
    return "a segment has a malformed % escape";
  }
  if (s.includes("/") || s.includes("\\")) return "a segment holds a separator (/ or \\) once decoded";
  if (hasControlChar(s)) return "a segment holds a control character";
  if (hasLoneSurrogate(s)) return "a segment holds a lone surrogate";
  return void 0;
};
function fold(start, parts) {
  let ups = start.ups;
  const segs = [...start.segs];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (segs.length > 0) segs.pop();
      else ups += 1;
      continue;
    }
    if (ENCODED_DOT_SEGMENT.test(part)) return "encoded-dot";
    segs.push(part);
  }
  return { ups, segs };
}
function bundleRelativeTarget(href, fromEntry, onRefused) {
  if (href === "" || href.startsWith("#") || href.startsWith("//") || SCHEME.test(href)) return null;
  if (href.startsWith(FS_PREFIX)) return null;
  const refuse = (reason) => {
    onRefused?.(reason);
    return "refused";
  };
  const hash = href.indexOf("#");
  const beforeHash = hash === -1 ? href : href.slice(0, hash);
  const fragment = hash === -1 ? "" : href.slice(hash + 1);
  const query = beforeHash.indexOf("?");
  const pathPart = query === -1 ? beforeHash : beforeHash.slice(0, query);
  if (pathPart.includes("\\")) return refuse("it has a backslash");
  const entryDir = fold({ ups: 0, segs: [] }, fromEntry.split("/").slice(0, -1));
  if (entryDir === "encoded-dot" || entryDir.ups > 0) return null;
  const target = fold(pathPart.startsWith("/") ? { ups: 0, segs: [] } : entryDir, pathPart.split("/"));
  if (target === "encoded-dot") return refuse("it has a percent-encoded dot segment");
  if (pathPart.startsWith("/") || target.ups === 0) return "inside";
  if (query !== -1) return refuse("it leaves the bundle with a query");
  if (fragment.includes("#")) return refuse("it leaves the bundle with a second #");
  if (target.segs.length === 0) return refuse("it lands on a directory and names no file");
  for (const seg of target.segs) {
    const reason = segmentRefusal(seg);
    if (reason) return refuse(reason);
  }
  const path = [...Array(target.ups).fill(".."), ...target.segs].join("/");
  return fragment ? { path, fragment } : { path };
}
export {
  bundleRelativeTarget
};
//# sourceMappingURL=bundleLinkPath.js.map