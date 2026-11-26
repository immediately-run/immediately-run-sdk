import "./chunk-VHAA22YE.js";
import { APP_ROOT, underAppRoot } from "./_workspace/platform-constants.js";
import { joinPaths } from "./pathUtils.js";
const FILES_PREFIX = "/files";
const getOuterHostname = (outerHref) => {
  const url = new URL(outerHref);
  return `${url.protocol}//${url.host}`;
};
const getSearchParams = (search) => Object.fromEntries([...new URLSearchParams(search ?? window.location.search).entries()]);
const splitHash = (target) => {
  const i = target.indexOf("#");
  return i === -1 ? [target, ""] : [target.slice(0, i), target.slice(i + 1)];
};
const parseTarget = (target, navigation) => {
  const newNavigation = { ...navigation };
  let [prehash, hash] = target.split("#");
  if (prehash) {
    let [path, search] = prehash.split("?");
    if (path) {
      newNavigation.sandboxPath = path;
    }
    newNavigation.search = search ? search : "";
  }
  newNavigation.hash = hash ? hash : "";
  return newNavigation;
};
const maybeParseUrl = (str) => {
  try {
    return new URL(str);
  } catch (_) {
    return null;
  }
};
const isAbsolutePath = (sandboxPath) => sandboxPath.startsWith("/");
const repositoryPrefixURL = (outerHref, navigationState) => constructUrl(outerHref, {
  ...navigationState,
  sandboxPath: "",
  hash: "",
  search: ""
});
const constructOuterUrl = (previousOuterHref, sandboxTarget, navigationState, addFilesPrefix = true) => {
  if (isAbsolutePath(sandboxTarget)) {
    const [pathPart, hash] = splitHash(sandboxTarget);
    return constructUrl(previousOuterHref, {
      ...navigationState,
      sandboxPath: addFilesPrefix ? joinPaths(FILES_PREFIX, pathPart) : pathPart,
      hash
    });
  }
  return new URL(sandboxTarget, constructUrl(previousOuterHref, navigationState)).toString();
};
let lastRefusedBase = void 0;
const acceptFilesHrefBase = (base, outerHref) => {
  if (base === void 0 || base === null || base === "") return null;
  let ok = false;
  try {
    ok = typeof base === "string" && base.endsWith("/") && getOuterHostname(base) === getOuterHostname(outerHref);
  } catch {
    ok = false;
  }
  if (!ok) {
    if (base === lastRefusedBase) return null;
    lastRefusedBase = base;
    console.warn(
      `[sdk] ignoring filesHrefBase ${JSON.stringify(
        base
      )}: not an absolute URL ending in '/' on ${outerHref}'s origin`
    );
    return null;
  }
  return base;
};
const displayHref = (appHref, state) => {
  if (!state.filesHrefBase) return appHref;
  const filesHome = repositoryPrefixURL(state.outerHref, state.navigationState) + FILES_PREFIX.slice(1);
  if (!appHref.startsWith(filesHome)) return appHref;
  const rest = appHref.slice(filesHome.length);
  if (rest === "") return state.filesHrefBase;
  if (rest.startsWith("/")) return state.filesHrefBase + rest.slice(1);
  if (rest.startsWith("?") || rest.startsWith("#")) return state.filesHrefBase + rest;
  return appHref;
};
const appHrefFor = (target, state) => {
  const base = state.filesHrefBase;
  if (!base || !target.startsWith(base)) return target;
  const filesHome = repositoryPrefixURL(state.outerHref, state.navigationState) + FILES_PREFIX.slice(1);
  const rest = target.slice(base.length);
  if (rest === "") return filesHome;
  if (rest.startsWith("?") || rest.startsWith("#")) return filesHome + rest;
  return `${filesHome}/${rest}`;
};
const isInternalHref = (outerHref, target, navigationState) => {
  const parsedUrl = maybeParseUrl(target);
  if (parsedUrl) {
    return target.startsWith(repositoryPrefixURL(outerHref, navigationState));
  }
  return true;
};
const platformHref = (outerHref, path) => {
  if (typeof path !== "string") {
    throw new TypeError(`platformHref: path must be a string, got ${typeof path}`);
  }
  if (!outerHref) return path;
  try {
    return new URL(path, outerHref).toString();
  } catch {
    return path;
  }
};
const decodeSegment = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};
const PATH_SEGMENTS = [
  { name: "mode", pattern: "\\w+" },
  { name: "provider", pattern: "[^/]+" },
  { name: "namespace", pattern: "[^/]+" },
  { name: "repository", pattern: "[^/]+" },
  // The ref is percent-encoded by the host so a `/` inside it stays ONE segment; decode
  // on the way in and re-encode on the way out (`encode`), so app code always sees the
  // real ref (`claude/x`) and never the wire form.
  { name: "ref", pattern: "[^/]+", transform: decodeSegment, encode: encodeURIComponent },
  { name: "sandboxPath", pattern: ".*", transform: (s) => `/${s}`, optionalLeadingSlash: true }
];
const OUTER_HREF_REGEXP = new RegExp(
  "^" + PATH_SEGMENTS.map(
    ({ name, pattern, optionalLeadingSlash }) => optionalLeadingSlash ? `(?:/(?<${name}>${pattern}))?` : `/(?<${name}>${pattern})`
  ).join("") + "$"
);
const parsePath = (pathname) => {
  const matchResults = pathname.match(OUTER_HREF_REGEXP)?.groups ?? {};
  return PATH_SEGMENTS.reduce((acc, { name, transform }) => {
    let value = void 0;
    if (name in matchResults) {
      value = matchResults[name];
    }
    if (!value) {
      value = "";
    }
    if (typeof value === "string") {
      acc[name] = transform ? transform(value) : value;
    }
    return acc;
  }, {});
};
const parseHref = (href) => {
  const parsedUrl = new URL(href);
  const pathnameState = parsePath(parsedUrl.pathname);
  return {
    ...pathnameState,
    search: parsedUrl.search.substring(1),
    hash: parsedUrl.hash.substring(1)
  };
};
const stripSlashPrefix = (s) => s.startsWith("/") ? s.substring(1) : s;
const constructUrl = (outerHref, navigationState) => {
  const path = PATH_SEGMENTS.map(({ name, encode }) => {
    const value = stripSlashPrefix(navigationState[name] ?? "");
    return encode ? encode(value) : value;
  }).join("/");
  const host = getOuterHostname(outerHref);
  let url = `${host}/${path}`;
  if (navigationState.search) {
    url += "?" + navigationState.search;
  }
  if (navigationState.hash) {
    url += "#" + navigationState.hash;
  }
  return url;
};
export {
  APP_ROOT,
  FILES_PREFIX,
  acceptFilesHrefBase,
  appHrefFor,
  constructOuterUrl,
  constructUrl,
  displayHref,
  getOuterHostname,
  getSearchParams,
  isAbsolutePath,
  isInternalHref,
  maybeParseUrl,
  parseHref,
  parsePath,
  parseTarget,
  platformHref,
  repositoryPrefixURL,
  splitHash,
  underAppRoot
};
//# sourceMappingURL=urlUtils.js.map