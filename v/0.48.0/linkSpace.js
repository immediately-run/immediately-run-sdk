import "./chunk-VHAA22YE.js";
import { createContext } from "react";
const FS_PREFIX = "$fs:";
const LinkSpaceContext = createContext({
  corpusRoot: null,
  bundleChrooted: false
});
const normalizeAbsolute = (path) => {
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
export {
  FS_PREFIX,
  LinkSpaceContext,
  normalizeAbsolute,
  resolveLinkTarget
};
//# sourceMappingURL=linkSpace.js.map