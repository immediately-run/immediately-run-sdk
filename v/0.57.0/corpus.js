import "./chunk-VHAA22YE.js";
import { createContext, use, useMemo } from "react";
import { useMetadataStore } from "./metadataSource";
const EMPTY_SCOPE = { root: null, entry: null, toHref: (p) => p };
const CorpusContext = createContext(EMPTY_SCOPE);
const useCorpus = () => use(CorpusContext);
const toCorpusPath = (absolute, root) => {
  if (root === null) return null;
  const base = root.replace(/\/+$/, "");
  if (base === "") return absolute;
  if (!absolute.startsWith(`${base}/`)) return null;
  return absolute.slice(base.length);
};
const fromCorpusPath = (corpusPath, root) => {
  if (root === null) return null;
  const base = root.replace(/\/+$/, "");
  return `${base}${corpusPath.startsWith("/") ? "" : "/"}${corpusPath}`;
};
const useCorpusEntries = () => {
  const files = useMetadataStore();
  const { root, toHref } = useCorpus();
  return useMemo(() => {
    if (root === null) return [];
    const out = [];
    for (const [absolute, meta] of Object.entries(files)) {
      const path = toCorpusPath(absolute, root);
      if (path === null) continue;
      out.push({ path, href: toHref(path), meta });
    }
    out.sort((a, b) => a.path.localeCompare(b.path));
    return out;
  }, [files, root, toHref]);
};
const useCorpusEntry = (corpusPath) => {
  const files = useMetadataStore();
  const { root } = useCorpus();
  return useMemo(() => {
    const absolute = fromCorpusPath(corpusPath, root);
    return absolute === null ? void 0 : files[absolute];
  }, [corpusPath, files, root]);
};
const useCurrentEntry = () => {
  const files = useMetadataStore();
  const { root, entry, toHref } = useCorpus();
  return useMemo(() => {
    if (root === null || entry === null) return null;
    const absolute = fromCorpusPath(entry, root);
    const meta = absolute === null ? void 0 : files[absolute];
    if (meta === void 0) return null;
    return { path: entry, href: toHref(entry), meta };
  }, [files, root, entry, toHref]);
};
export {
  CorpusContext,
  fromCorpusPath,
  toCorpusPath,
  useCorpus,
  useCorpusEntries,
  useCorpusEntry,
  useCurrentEntry
};
//# sourceMappingURL=corpus.js.map