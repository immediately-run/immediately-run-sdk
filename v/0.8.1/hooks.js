import { use, useEffect, useMemo, useState } from "react";
import { TinkerableContext } from "./TinkerableContext";
const evaluateQueryFunction = (filesMetadata, queryFunction) => {
  try {
    return { result: queryFunction(filesMetadata) };
  } catch (e) {
    return { error: e };
  }
};
const arraysEqual = (a, b) => {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
};
const useMetadataQuery = (queryFunction) => {
  const { filesMetadata } = use(TinkerableContext);
  const [queryResult, setQueryResult] = useState(null);
  useEffect(() => {
    setQueryResult((prevResult) => {
      const newResult = evaluateQueryFunction(filesMetadata, queryFunction);
      if (!prevResult) {
        return newResult;
      }
      if (!("result" in newResult)) {
        return newResult;
      }
      if (!("result" in prevResult)) {
        return newResult;
      }
      return arraysEqual(prevResult.result, newResult.result) ? prevResult : newResult;
    });
  }, [filesMetadata, setQueryResult, queryFunction]);
  return queryResult;
};
const useFileMetadata = (path) => {
  const { filesMetadata } = use(TinkerableContext);
  const result = useMemo(() => filesMetadata[path], [path, filesMetadata]);
  return result;
};
export {
  useFileMetadata,
  useMetadataQuery
};
//# sourceMappingURL=hooks.js.map