import "./chunk-VHAA22YE.js";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { TinkerableContext } from "./TinkerableContext";
import { openFs } from "./fs";
const entriesEqual = (a, b) => {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i].path !== b[i].path || a[i].meta !== b[i].meta) {
      return false;
    }
  }
  return true;
};
const useMetadataQuery = (queryFunction) => {
  const { filesMetadata } = use(TinkerableContext);
  const previous = useRef([]);
  return useMemo(() => {
    const files = filesMetadata ?? {};
    let entries;
    try {
      entries = queryFunction(files).map((path) => ({ path, meta: files[path] }));
    } catch (error) {
      return { error };
    }
    if (entriesEqual(entries, previous.current)) {
      return previous.current;
    }
    previous.current = entries;
    return entries;
  }, [filesMetadata, queryFunction]);
};
const useFileMetadata = (path) => {
  const { filesMetadata } = use(TinkerableContext);
  return useMemo(
    () => (filesMetadata ?? {})[path],
    [path, filesMetadata]
  );
};
const useAllMetadata = () => {
  const { filesMetadata } = use(TinkerableContext);
  return filesMetadata ?? {};
};
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