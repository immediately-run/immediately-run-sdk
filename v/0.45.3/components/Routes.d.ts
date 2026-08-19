import * as react from 'react';
import { ReactNode } from 'react';
import { RouteComponent } from '../RoutingSpec.js';

/** Props for a {@link Route} declared inside {@link Routes}. */
type RouteProps = {
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
declare const Route: (_props: RouteProps) => null;
/**
 * Resolves the active `sandboxPath` against its mounted `<Route>` children,
 * first-match-wins in render order, and renders the winner (or `fallback`). The
 * match scopes a nested context so `useRouteParams()` / `useRoute()` inside the
 * rendered route see this match. Use instead of (or nested within) a `boot`-time
 * `routingSpec`.
 */
declare const Routes: ({ children, fallback, }: {
    children?: ReactNode;
    fallback?: ReactNode;
}) => react.JSX.Element;

export { Route, type RouteProps, Routes };
