import "./chunk-VHAA22YE.js";
const PATH_SEPARATOR = "/";
const joinPaths = (...pathPart) => pathPart.reduce((acc, part) => {
  const left = acc.endsWith(PATH_SEPARATOR) ? acc.slice(0, -1) : acc;
  const right = part.startsWith(PATH_SEPARATOR) ? part.substring(1) : part;
  if (left || acc === PATH_SEPARATOR) {
    return `${left}${PATH_SEPARATOR}${right}`;
  }
  if (part.startsWith(PATH_SEPARATOR)) {
    return `${PATH_SEPARATOR}${right}`;
  }
  return right;
}, "");
const absPath = (rawPath) => {
  const absCandidate = joinPaths.apply(
    null,
    rawPath.split(PATH_SEPARATOR).reduce((partialAbsPath, currentPathPart) => {
      if (currentPathPart == ".") {
        return partialAbsPath;
      }
      if (currentPathPart == "..") {
        return partialAbsPath.slice(0, -1);
      }
      return partialAbsPath.concat(currentPathPart);
    }, [])
  );
  if (absCandidate === "" && rawPath.startsWith(PATH_SEPARATOR)) {
    return PATH_SEPARATOR;
  }
  return absCandidate;
};
export {
  absPath,
  joinPaths
};
//# sourceMappingURL=pathUtils.js.map