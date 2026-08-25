import type { FC, ReactNode } from 'react';

/** Named parameters extracted from a route match (`:name` segments, `*` rest). */
export type RouteParams = Record<string, string>;

/** A route target that receives the matched params as a prop. */
export type RouteComponent = FC<{ params: RouteParams }>;

export type RoutingRule = {
  name?: string;
  /**
   * What to match against the app-owned `sandboxPath`. A string is a path
   * template (`/posts/:slug`, `/files/*`, or a literal like `/`) compiled to an
   * anchored regex; a `RegExp` is used as authored (the escape hatch — you own
   * anchoring).
   */
  pattern: string | RegExp;
  /** Element to render for this route. Reads params via `useRouteParams()`. */
  element?: ReactNode;
  /** Component to render for this route; receives the matched params as a prop. */
  component?: RouteComponent;
  /** @deprecated Use `element`. Accepted for backward compatibility. */
  reactNode?: ReactNode;
};

export type RoutingSpec = {
  routes: RoutingRule[];
};
