import type { ReactNode } from 'react';
import { Children, isValidElement, use } from 'react';

import { TinkerableContext } from '../TinkerableContext';
import type { RouteComponent, RoutingRule } from '../RoutingSpec';
import { matchRoute } from '../routeMatch';
import { renderRoute } from '../routing';

/** Props for a {@link Route} declared inside {@link Routes}. */
export type RouteProps = {
  /** A path template (`/posts/:slug`, `/files/*`, `/`) or a raw RegExp. */
  path: string | RegExp;
  name?: string;
  /** Element to render; reads params via `useRouteParams()`. */
  element?: ReactNode;
  /** Component to render; receives matched params as a prop. */
  component?: RouteComponent;
};

/**
 * Declares a route. Rendered as a child of `<Routes>`, where it is read for its
 * props — it renders nothing on its own. Mounting a `<Route>` registers it;
 * unmounting (or conditionally not rendering it) removes it, which is how routes
 * become dynamic without a mutable registry.
 */
export const Route = (_props: RouteProps): null => null;

/**
 * Resolves the active `sandboxPath` against its mounted `<Route>` children,
 * first-match-wins in render order, and renders the winner (or `fallback`). The
 * match scopes a nested context so `useRouteParams()` / `useRoute()` inside the
 * rendered route see this match. Use instead of (or nested within) a `boot`-time
 * `routingSpec`.
 */
export const Routes = ({
  children,
  fallback = null,
}: {
  children?: ReactNode;
  fallback?: ReactNode;
}) => {
  const context = use(TinkerableContext);
  const { sandboxPath } = context.navigationState;

  for (const child of Children.toArray(children)) {
    if (!isValidElement(child) || child.type !== Route) {
      continue;
    }
    const { path, element, component, name } = child.props as RouteProps;
    const params = matchRoute(path, sandboxPath);
    if (params) {
      const routingRule: RoutingRule = { name, pattern: path, element, component };
      const scoped = {
        ...context,
        navigationState: { ...context.navigationState, routingRule, pathParameters: params },
      };
      return (
        <TinkerableContext value={scoped}>
          {renderRoute(routingRule, params)}
        </TinkerableContext>
      );
    }
  }

  return <>{fallback}</>;
};
