import "./chunk-VHAA22YE.js";
import { APP_ROOT, underAppRoot } from "./_workspace/platform-constants.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { openFs } from "./fs";
import { useMetadataStore } from "./metadataSource";
const entriesEqual = (a, b) => {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i].path !== b[i].path || a[i].meta !== b[i].meta) {
      return false;
    }
    const ax = a[i];
    const bx = b[i];
    const keys = /* @__PURE__ */ new Set([...Object.keys(ax), ...Object.keys(bx)]);
    for (const k of keys) {
      if (k === "path" || k === "meta") continue;
      if (ax[k] !== bx[k]) return false;
    }
  }
  return true;
};
const useMetadataQuery = (queryFunction) => {
  const files = useMetadataStore();
  const previous = useRef([]);
  return useMemo(() => {
    let entries;
    try {
      entries = queryFunction(files).map(
        (selected) => typeof selected === "string" ? { path: selected, meta: files[selected] } : { ...selected, path: selected.path, meta: files[selected.path] }
      );
    } catch (error) {
      return { error };
    }
    if (entriesEqual(entries, previous.current)) {
      return previous.current;
    }
    previous.current = entries;
    return entries;
  }, [files, queryFunction]);
};
const useFileMetadata = (path) => {
  const files = useMetadataStore();
  return useMemo(() => {
    const direct = files[path];
    if (direct !== void 0) return direct;
    if (path === APP_ROOT || path.startsWith(`${APP_ROOT}/`)) return void 0;
    return files[underAppRoot(path)];
  }, [path, files]);
};
const useAllMetadata = () => useMetadataStore();
const useObjectUrl = (mount, relPath, opts) => {
  const [state, setState] = useState({
    url: null,
    loading: Boolean(mount && relPath),
    error: null
  });
  const type = opts?.type;
  const mountPath = mount?.path;
  useEffect(() => {
    if (!mount || !relPath) {
      setState({ url: null, loading: false, error: null });
      return;
    }
    let alive = true;
    let revoke = null;
    setState({ url: null, loading: true, error: null });
    openFs(mount).readObjectUrl(relPath, type ? { type } : void 0).then((res) => {
      if (!alive) {
        res.revoke();
        return;
      }
      revoke = res.revoke;
      setState({ url: res.url, loading: false, error: null });
    }).catch((e) => {
      if (alive) setState({ url: null, loading: false, error: e });
    });
    return () => {
      alive = false;
      if (revoke) revoke();
    };
  }, [mountPath, relPath, type]);
  return state;
};
export {
  useAllMetadata,
  useFileMetadata,
  useMetadataQuery,
  useObjectUrl
};
//# sourceMappingURL=hooks.js.map