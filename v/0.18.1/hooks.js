import { use, useMemo, useRef } from "react";
import { TinkerableContext } from "./TinkerableContext";
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
export {
  useAllMetadata,
  useFileMetadata,
  useMetadataQuery
};
//# sourceMappingURL=hooks.js.map