import type { ReactNode } from 'react';
import { use, useContext } from 'react';

import { sendMessage } from './sandboxUtils';
import { NavigationState, TinkerableContext } from './TinkerableContext';
import { RouteParams, RoutingRule, RoutingSpec } from './RoutingSpec';
import { matchRoute } from './routeMatch';
import { constructUrl, isAbsolutePath, parseTarget } from './urlUtils';
import { joinPaths } from './pathUtils';

export type AppliedRoutingRule = {
  routingRule: RoutingRule,
  pathParameters?: Record<string, string>;
}

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


// Perform in-site navigation.
// Top level frame is messaged to updated URL, after which a message will be
// sent wit the new href, triggering the actual navigation.
export const navigate = (target: string) => {
  console.log(`[Sandbox] Navigating to ${target}`)
  sendMessage('urlchange', {
    url: target,
    back: false,
    forward: false,
  });
};
