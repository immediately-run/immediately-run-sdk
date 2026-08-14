import { joinPaths } from "./pathUtils";
import { NavigationState, PathState } from "./TinkerableContext";

export const FILES_PREFIX = '/files';

/**
 * Mount point of the Git repository inside the sandbox filesystem. The sandbox
 * fs is rooted at `/` (so apps can reach dynamic mounts like `/firestore`), with
 * the repo mounted here. URL subpaths are repo-relative, so the file router
 * resolves them under `APP_ROOT`.
 */
export const APP_ROOT = '/app';

/** Resolve a repo-relative path (e.g. a URL subpath) to its absolute sandbox path. */
export const underAppRoot = (repoRelativePath: string): string =>
  joinPaths(APP_ROOT, repoRelativePath);

/**
 * The origin every outer URL is rebuilt on — `protocol//host`, **port included**.
 *
 * `url.hostname` drops the port; `url.host` keeps it (and still omits it for the default
 * 80/443, so a production URL is byte-identical either way). Using `hostname` here was
 * invisible on `https://immediately.run` and broke every routed link under local dev on any
 * port but 80: `http://localhost:3100/edit/…` was rebuilt as `http://localhost/edit/…`.
 *
 * Worse than a wrong link, it silently changed link BEHAVIOUR. `repositoryPrefixURL` is
 * built from this, and `isInternalHref` decides by prefix-matching against it — so an
 * absolute in-app URL failed the match, was classified EXTERNAL, and rendered as a plain
 * `<a>`. Clicking it performed a real navigation out of the sandboxed frame instead of
 * routing: the app appeared to "reload" on an ordinary internal link.
 */
export const getOuterHostname = (outerHref:string) => {
  const url = new URL(outerHref);
  return `${url.protocol}//${url.host}`;
}

export const getSearchParams = (search?: string): Record<string, string> => Object.fromEntries(
  [...(new URLSearchParams(search ?? window.location.search).entries())]);

/**
 * Split a link target into its path part and its `#fragment` (the `#` dropped),
 * e.g. `"FOO.mdx#sec-8-9"` → `["FOO.mdx", "sec-8-9"]`, `"#sec-3"` → `["", "sec-3"]`,
 * `"FOO.mdx"` → `["FOO.mdx", ""]`. Only the **first** `#` splits — a fragment never
 * contains another `#`. The seam between wiki-links (§13) and heading ids (§15):
 * existence is resolved on the path part, the fragment is threaded to navigation.
 * MARKDOWN_SYNTAX_SPEC §13.5.
 */
export const splitHash = (target: string): [string, string] => {
  const i = target.indexOf('#');
  return i === -1 ? [target, ''] : [target.slice(0, i), target.slice(i + 1)];
};


export const parseTarget = (target: string, navigation: NavigationState): NavigationState => {
  const newNavigation = { ...navigation };
  let [prehash, hash] = target.split("#")
  if (prehash) {
    let [path, search] = prehash.split("?")
    if (path) {
      newNavigation.sandboxPath = path
    }
    newNavigation.search = search ? search : '';
  }
  newNavigation.hash = hash ? hash : '';
  return newNavigation
}


export const maybeParseUrl = (str: string): URL | null => {
  try {
    return new URL(str);
  } catch (_) {
    return null;
  }
}

export const isAbsolutePath = (sandboxPath: string) => sandboxPath.startsWith('/');

/**
 * The origin+repo prefix every same-app URL starts with — used by {@link isInternalHref} to
 * decide whether an absolute href is "this app" or somewhere else.
 *
 * `hash` and `search` are cleared, not just `sandboxPath`. They belong to the CURRENT page,
 * and leaving them in put them on the end of a *prefix*: from a page carrying `#sec-8-9`,
 * the prefix became `…/main/#sec-8-9`, no same-app URL could start with it, every absolute
 * in-app link was classified EXTERNAL, and clicking one navigated the sandboxed frame away
 * instead of routing. A page with a fragment quietly broke its own links.
 */
export const repositoryPrefixURL = (outerHref:string, navigationState: NavigationState) => constructUrl(outerHref, {
      ...navigationState,
      sandboxPath: '',
      hash: '',
      search: '',
    });

export const constructOuterUrl = (previousOuterHref:string, sandboxTarget:string, navigationState: NavigationState, addFilesPrefix=true):string => {
  if (isAbsolutePath(sandboxTarget)) {
    // Split a trailing `#fragment` off before the target is folded into the
    // sandboxPath, and carry it in `hash` instead — a fragment addresses a section,
    // not a file, so it must not leak into the path (MARKDOWN_SYNTAX_SPEC §13.5). An
    // absolute target with no fragment clears any stale hash from the prior state.
    const [pathPart, hash] = splitHash(sandboxTarget);
    return constructUrl(
      previousOuterHref,
      {
        ...navigationState,
        sandboxPath: addFilesPrefix ? joinPaths(FILES_PREFIX, pathPart) : pathPart,
        hash,
      })
  }
  return (
    new URL(
      sandboxTarget,
      constructUrl(
        previousOuterHref,
        navigationState
      )
    )
  ).toString();
}

export const isInternalHref = (outerHref:string, target: string, navigationState: NavigationState) => {
  const parsedUrl = maybeParseUrl(target);
  if (parsedUrl) {
    return target.startsWith(repositoryPrefixURL(outerHref, navigationState));
  }
  // if target is not a valid URL, then assume it's relative.
  return true;
}

export type PathSegment = {
  name: string,
  pattern: string,
  transform?: (pathSegment: string) => string,
  // When true, the leading slash that delimits this segment is optional, so the
  // whole `/segment` group can be absent. Used for the trailing sandboxPath:
  // an outer href of `/mode/provider/namespace/repository/ref` (no trailing
  // slash, no sub-path) must still parse, otherwise the regex matches nothing
  // and every segment comes back empty.
  optionalLeadingSlash?: boolean
}

const PATH_SEGMENTS: PathSegment[] = [
  { name: 'mode', pattern: '\\w+' },
  { name: 'provider', pattern: '[a-zA-Z0-9-_]+' },
  { name: 'namespace', pattern: '[a-zA-Z0-9-_]+' },
  { name: 'repository', pattern: '[a-zA-Z0-9-_]+' },
  { name: 'ref', pattern: '[a-zA-Z0-9-_]+' },
  { name: 'sandboxPath', pattern: '.*', transform: s => `/${s}`, optionalLeadingSlash: true }
];

const OUTER_HREF_REGEXP = new RegExp(
  '^' +
  PATH_SEGMENTS.map(({ name, pattern, optionalLeadingSlash }) =>
    optionalLeadingSlash
      ? `(?:\/(?<${name}>${pattern}))?`
      : `\/(?<${name}>${pattern})`
  ).join('') +
  "$"
);


export const parsePath = (pathname: string): PathState => {
  const matchResults = pathname.match(OUTER_HREF_REGEXP)?.groups ?? {};
  return PATH_SEGMENTS.reduce((acc: Partial<PathState>, { name, transform }: PathSegment) => {
    let value: string | undefined = undefined;
    if (name in matchResults) {
      value = matchResults[name];
    }
    if (!value) {
      // fall back to default value if var not present in
      value = '';
    }
    if (typeof value === 'string') {
      acc[name] = transform ? transform(value) : value;
    }
    return acc;
  }, {}) as PathState;
}

export const parseHref = (href: string): NavigationState => {
  const parsedUrl = new URL(href);
  const pathnameState = parsePath(parsedUrl.pathname);
  return {
    ...pathnameState,
    search: parsedUrl.search.substring(1),
    hash: parsedUrl.hash.substring(1),
  } as NavigationState
}

const stripSlashPrefix = (s: string): string => s.startsWith('/') ? s.substring(1) : s;

export const constructUrl = (outerHref:string, navigationState: NavigationState): string => {
  const path = PATH_SEGMENTS.map(({ name }) => {
    let value = navigationState[name];
    return stripSlashPrefix(value ?? '');
  }).join('/');
  const host = getOuterHostname(outerHref);
  let url = `${host}/${path}`
  if (navigationState.search) {
    url += '?' + navigationState.search
  }
  if (navigationState.hash) {
    url += '#' + navigationState.hash
  }
  return url;
}
