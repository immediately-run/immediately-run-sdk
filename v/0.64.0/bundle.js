import "./chunk-VHAA22YE.js";
import { createContext, use, useMemo } from "react";
import { useMetadataStore } from "./metadataSource";
const EMPTY_SCOPE = { root: null, entry: null, toHref: (p) => p };
const BundleContext = createContext(EMPTY_SCOPE);
const useBundle = () => use(BundleContext);
const toBundlePath = (absolute, root) => {
  if (root === null) return null;
  const base = root.replace(/\/+$/, "");
  if (base === "") return absolute;
  if (!absolute.startsWith(`${base}/`)) return null;
  return absolute.slice(base.length);
};
const fromBundlePath = (bundlePath, root) => {
  if (root === null) return null;
  const base = root.replace(/\/+$/, "");
  return `${base}${bundlePath.startsWith("/") ? "" : "/"}${bundlePath}`;
};
const useBundleEntries = () => {
  const files = useMetadataStore();
  const { root, toHref } = useBundle();
  return useMemo(() => {
    if (root === null) return [];
    const out = [];
    for (const [absolute, meta] of Object.entries(files)) {
      const path = toBundlePath(absolute, root);
      if (path === null) continue;
      out.push({ path, href: toHref(path), meta });
    }
    out.sort((a, b) => a.path.localeCompare(b.path));
    return out;
  }, [files, root, toHref]);
};
const useBundleEntry = (bundlePath) => {
  const files = useMetadataStore();
  const { root } = useBundle();
  return useMemo(() => {
    const absolute = fromBundlePath(bundlePath, root);
    return absolute === null ? void 0 : files[absolute];
  }, [bundlePath, files, root]);
};
const useCurrentEntry = () => {
  const files = useMetadataStore();
  const { root, entry, toHref } = useBundle();
  return useMemo(() => {
    if (root === null || entry === null) return null;
    const absolute = fromBundlePath(entry, root);
    const meta = absolute === null ? void 0 : files[absolute];
    if (meta === void 0) return null;
    return { path: entry, href: toHref(entry), meta };
  }, [files, root, entry, toHref]);
};
export {
  BundleContext,
  fromBundlePath,
  toBundlePath,
  useBundle,
  useBundleEntries,
  useBundleEntry,
  useCurrentEntry
};
//# sourceMappingURL=bundle.js.map