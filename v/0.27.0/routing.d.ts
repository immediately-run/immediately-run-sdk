import { ReactNode } from 'react';
import { NavigationState } from './TinkerableContext.js';
import { RoutingRule, RoutingSpec, RouteParams } from './RoutingSpec.js';
import './sandboxTypes.js';

/** The result of matching a path: the winning {@link RoutingRule} plus its captured params. */
type AppliedRoutingRule = {
    routingRule: RoutingRule;
    pathParameters?: Record<string, string>;
};
/** Build the full outer href for an in-app target (absolute `sandboxPath` or a
 *  path relative to the current route), e.g. for an `href` attribute. */
declare const useTinkerableLink: (newSandboxLocation: string) => string;
/** Find the first rule in `routingSpec` whose pattern matches the current
 *  `sandboxPath`, returning it with the captured params (or `undefined`). */
declare const applyRoutingRule: (routingSpec: RoutingSpec, navigationState: NavigationState) => AppliedRoutingRule | undefined;
/** Render a matched rule, passing params to a `component` and falling back to `element`/`reactNode`. */
declare const renderRoute: (routingRule: RoutingRule, params: RouteParams) => ReactNode;
/** Render the route matched for the current location (set up by `boot`'s route table). */
declare const Router: () => ReactNode;
/** Read the current route's matched params (`:name` segments and the `*` wildcard). */
declare const useRouteParams: <T extends RouteParams = RouteParams>() => T;
/**
 * Read the current route: the matched rule's `name`, its `params`, the app-owned
 * `sandboxPath`, and the read-only platform prefix fields (`mode`, `provider`,
 * `namespace`, `repository`, `ref`) — e.g. to tell `/edit` from `/present`.
 */
declare const useRoute: () => {
    name: string | undefined;
    params: RouteParams;
    sandboxPath: string;
    mode: string;
    provider: string;
    namespace: string;
    repository: string;
    ref: string;
};
/**
 * Navigate within the app. Messages the host to update the URL; the host then
 * pushes the new href back, which drives the actual route change.
 */
declare const navigate: (target: string) => void;

export { type AppliedRoutingRule, Router, applyRoutingRule, navigate, renderRoute, useRoute, useRouteParams, useTinkerableLink };
