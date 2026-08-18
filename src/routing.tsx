import type { ReactNode } from 'react';
import { use, useContext } from 'react';

import { sendMessage } from './sandboxUtils';
import { NavigationState, TinkerableContext } from './TinkerableContext';
import { RouteParams, RoutingRule, RoutingSpec } from './RoutingSpec';
import { matchRoute } from './routeMatch';
import { constructUrl, isAbsolutePath, parseTarget } from './urlUtils';
import { joinPaths } from './pathUtils';
import { URLCHANGE } from './generated/protocol';

/** The result of matching a path: the winning {@link RoutingRule} plus its captured params. */
export type AppliedRoutingRule = {
  routingRule: RoutingRule,
  pathParameters?: Record<string, string>;
}

/** Build the full outer href for an in-app target (absolute `sandboxPath` or a
 *  path relative to the current route), e.g. for an `href` attribute. */
export const useTinkerableLink = (newSandboxLocation: string) => {
  const { outerHref, navigationState: navigation } = use(TinkerableContext);
  let newNavigationState = parseTarget(newSandboxLocation, navigation);
  if (!isAbsolutePath(newSandboxLocation)) {
    newNavigationState.sandboxPath = joinPaths(navigation.sandboxPath, newSandboxLocation)
  } else {
    newNavigationState.sandboxPath = newSandboxLocation
  }
  return constructUrl(outerHref, newNavigationState);
}

/** Find the first rule in `routingSpec` whose pattern matches the current
 *  `sandboxPath`, returning it with the captured params (or `undefined`). */
export const applyRoutingRule = (routingSpec:RoutingSpec, navigationState: NavigationState): AppliedRoutingRule | undefined => {
  const { sandboxPath } = navigationState;
  for (const routingRule of routingSpec.routes) {
    const pathParameters = matchRoute(routingRule.pattern, sandboxPath);
    if (pathParameters) {
      return { routingRule, pathParameters };
    }
  }
  return undefined;
}

/** Render a matched rule, passing params to a `component` and falling back to `element`/`reactNode`. */
export const renderRoute = (routingRule: RoutingRule, params: RouteParams): ReactNode => {
  if (routingRule.component) {
    const Component = routingRule.component;
    return <Component params={params} />;
  }
  return routingRule.element ?? routingRule.reactNode ?? null;
};

/** Render the route matched for the current location (set up by `boot`'s route table). */
export const Router = () => {
  const context = useContext(TinkerableContext);
  const {navigationState: {routingRule, pathParameters}} = context;
  if (!routingRule) {
    // TODO: better error
    throw new Error(`No route registered for path ${context.navigationState.sandboxPath}!`);
  }

  return renderRoute(routingRule, pathParameters ?? {});
};

/** Read the current route's matched params (`:name` segments and the `*` wildcard). */
export const useRouteParams = <T extends RouteParams = RouteParams>(): T =>
  (use(TinkerableContext).navigationState.pathParameters ?? {}) as T;

/**
 * Read the current route: the matched rule's `name`, its `params`, the app-owned
 * `sandboxPath`, and the read-only platform prefix fields (`mode`, `provider`,
 * `namespace`, `repository`, `ref`) — e.g. to tell `/edit` from `/present`.
 */
export const useRoute = () => {
  const { navigationState } = use(TinkerableContext);
  const { routingRule, pathParameters, sandboxPath, mode, provider, namespace, repository, ref } = navigationState;
  return {
    name: routingRule?.name,
    params: (pathParameters ?? {}) as RouteParams,
    sandboxPath,
    mode,
    provider,
    namespace,
    repository,
    ref,
  };
};


/**
 * Navigate within the app. Messages the host to update the URL; the host then
 * pushes the new href back, which drives the actual route change.
 *
 * `opts.viewedDocument` (R3-268) optionally declares which WORKING-TREE file
 * this destination renders — a tri-state rider on the navigation event:
 *  - omit the option entirely → the host derives the hint from the URL's
 *    `files/` suffix convention (the zero-SDK default);
 *  - `null` → this view shows no file (clears the highlight — tag pages,
 *    search, home views);
 *  - a repo-relative path (the CORPUS path under dispatch — only the viewer
 *    can map its own key space) → the file explorer highlights it.
 * The hint is highlight-only by contract (it never scrolls, never moves focus
 * or panes, never switches the editor) and is validated host-side for
 * existence — a wrong path degrades to "no highlight", never an error. The
 * host remembers declarations per URL, so back/forward reproduces them
 * without re-announcement.
 */
// R3-268: an app-registered rule mapping a navigation TARGET to its viewed
// document, consulted by `navigate()` whenever the caller did not declare one
// explicitly. Registered ONCE (e.g. at boot) so an app whose links all flow
// through `<Link>`/`navigate` gets correct declarations everywhere without
// threading an option through every call site. Return `undefined` for "no
// declaration" (the host falls back to the URL convention), `null` for "this
// view shows no file", or a working-tree repo-relative path.
let viewedDocumentResolver: ((targetHref: string) => string | null | undefined) | null = null;

/** Register the app's route→viewed-document rule (R3-268); pass `null` to clear. */
export const setViewedDocumentResolver = (
  resolver: ((targetHref: string) => string | null | undefined) | null,
): void => {
  viewedDocumentResolver = resolver;
};

export const navigate = (
  target: string,
  opts?: { viewedDocument?: string | null },
) => {
  console.log(`[Sandbox] Navigating to ${target}`)
  // Explicit option first; else the registered resolver; else nothing on the
  // wire (the host derives from the URL convention). A resolver throw is
  // swallowed to "no declaration" — a mapping bug must never break navigation.
  let declared: { viewedDocument: string | null } | Record<string, never> = {};
  if (opts && 'viewedDocument' in opts) {
    declared = { viewedDocument: opts.viewedDocument ?? null };
  } else if (viewedDocumentResolver) {
    try {
      const v = viewedDocumentResolver(target);
      if (v !== undefined) declared = { viewedDocument: v };
    } catch {
      /* no declaration */
    }
  }
  sendMessage(URLCHANGE, {
    url: target,
    back: false,
    forward: false,
    ...declared,
  });
};
