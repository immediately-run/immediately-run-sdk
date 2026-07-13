import { NavigationState, PathState } from './TinkerableContext.js';
import 'react';
import './RoutingSpec.js';
import './sandboxTypes.js';

declare const FILES_PREFIX = "/files";
/**
 * Mount point of the Git repository inside the sandbox filesystem. The sandbox
 * fs is rooted at `/` (so apps can reach dynamic mounts like `/firestore`), with
 * the repo mounted here. URL subpaths are repo-relative, so the file router
 * resolves them under `APP_ROOT`.
 */
declare const APP_ROOT = "/app";
/** Resolve a repo-relative path (e.g. a URL subpath) to its absolute sandbox path. */
declare const underAppRoot: (repoRelativePath: string) => string;
declare const getOuterHostname: (outerHref: string) => string;
declare const getSearchParams: (search?: string) => Record<string, string>;
/**
 * Split a link target into its path part and its `#fragment` (the `#` dropped),
 * e.g. `"FOO.mdx#sec-8-9"` → `["FOO.mdx", "sec-8-9"]`, `"#sec-3"` → `["", "sec-3"]`,
 * `"FOO.mdx"` → `["FOO.mdx", ""]`. Only the **first** `#` splits — a fragment never
 * contains another `#`. The seam between wiki-links (§13) and heading ids (§15):
 * existence is resolved on the path part, the fragment is threaded to navigation.
 * MARKDOWN_SYNTAX_SPEC §13.5.
 */
declare const splitHash: (target: string) => [string, string];
declare const parseTarget: (target: string, navigation: NavigationState) => NavigationState;
declare const maybeParseUrl: (str: string) => URL | null;
declare const isAbsolutePath: (sandboxPath: string) => boolean;
declare const repositoryPrefixURL: (outerHref: string, navigationState: NavigationState) => string;
declare const constructOuterUrl: (previousOuterHref: string, sandboxTarget: string, navigationState: NavigationState, addFilesPrefix?: boolean) => string;
declare const isInternalHref: (outerHref: string, target: string, navigationState: NavigationState) => boolean;
type PathSegment = {
    name: string;
    pattern: string;
    transform?: (pathSegment: string) => string;
    optionalLeadingSlash?: boolean;
};
declare const parsePath: (pathname: string) => PathState;
declare const parseHref: (href: string) => NavigationState;
declare const constructUrl: (outerHref: string, navigationState: NavigationState) => string;

export { APP_ROOT, FILES_PREFIX, type PathSegment, constructOuterUrl, constructUrl, getOuterHostname, getSearchParams, isAbsolutePath, isInternalHref, maybeParseUrl, parseHref, parsePath, parseTarget, repositoryPrefixURL, splitHash, underAppRoot };
