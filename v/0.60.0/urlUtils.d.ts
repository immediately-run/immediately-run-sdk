export { APP_ROOT, underAppRoot } from '@immediately-run/platform-constants';
import { NavigationState, PathState } from './TinkerableContext.js';
import 'react';
import './RoutingSpec.js';
import './sandboxTypes.js';

declare const FILES_PREFIX = "/files";

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
declare const repositoryPrefixURL: (outerHref: string, navigationState: NavigationState) => string;
declare const constructOuterUrl: (previousOuterHref: string, sandboxTarget: string, navigationState: NavigationState, addFilesPrefix?: boolean) => string;
declare const isInternalHref: (outerHref: string, target: string, navigationState: NavigationState) => boolean;
/**
 * The href to render for a PLATFORM-space path — `/present/github/…`, `/edit/github/…`,
 * `/home`, `/settings/language-model`. These are the HOST's URLs, not this app's: inside the
 * sandboxed frame a root-relative `href` resolves against the SANDBOX origin, which serves no
 * such page, so the path is resolved against the OUTER origin (`outerHref`) instead. An
 * absolute `path` (`https://…`) is returned as-is, which `new URL` already does. With no host
 * (`vite dev`, an empty `outerHref`) or an unresolvable pair, `path` is returned unchanged so
 * the local dev server keeps working. A non-string `path` throws: a caller passing one has a
 * bug worth surfacing, not silently rendering.
 *
 * Render the result through `PlatformLink` (`./platformLink`), which also carries
 * `target="_top"` — an anchor inside the sandboxed frame otherwise navigates the frame.
 */
declare const platformHref: (outerHref: string, path: string) => string;
type PathSegment = {
    name: string;
    pattern: string;
    transform?: (pathSegment: string) => string;
    optionalLeadingSlash?: boolean;
    encode?: (value: string) => string;
};
declare const parsePath: (pathname: string) => PathState;
declare const parseHref: (href: string) => NavigationState;
declare const constructUrl: (outerHref: string, navigationState: NavigationState) => string;

export { FILES_PREFIX, type PathSegment, constructOuterUrl, constructUrl, getOuterHostname, getSearchParams, isAbsolutePath, isInternalHref, maybeParseUrl, parseHref, parsePath, parseTarget, platformHref, repositoryPrefixURL, splitHash };
