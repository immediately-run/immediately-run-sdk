import * as react_jsx_runtime from 'react/jsx-runtime';
import { FC, ReactNode } from 'react';
import { RoutingSpec } from './RoutingSpec.js';

/** Options for {@link boot}: MDX overrides, a route table, or an app root. */
type BootProps = {
    mdxComponents?: Record<string, FC>;
    routingSpec?: RoutingSpec;
    /**
     * App root rendered directly inside the providers (with full navigation
     * context), instead of dispatching through a `routingSpec`. Render
     * `<Routes>`/`<Route>` here for fully dynamic routing — no catch-all rule
     * boilerplate. Takes precedence over `routingSpec` for what is rendered.
     */
    children?: ReactNode;
};
/** The app shell {@link boot} renders: holds navigation state, subscribes to host
 *  URL + metadata pushes, and renders `children` or the route `<Router />`. */
declare const TinkerableApp: ({ routingSpec, children, }: {
    routingSpec: RoutingSpec;
    children?: ReactNode;
}) => react_jsx_runtime.JSX.Element;
/** The default route table when `boot` is called with no `routingSpec`/`children`:
 *  `/` → main content, `/files/<path>` → the file router, else not-found. */
declare const DEFAULT_ROUTING_SPEC: RoutingSpec;
/**
 * Matches any `sandboxPath` so navigation context can be built without a route
 * table. Used when {@link boot} is given `children` (the app owns dispatch via
 * `<Routes>`); the catch-all's `element` is never rendered (children are).
 */
declare const CATCH_ALL_ROUTING_SPEC: RoutingSpec;
/**
 * Mount an immediately.run app into the sandbox `#root`. The entry point every
 * app calls from `index.tsx`: wires the MDX, module-cache, and navigation
 * providers, then renders the route table (`routingSpec`) or your `children`.
 */
declare const boot: ({ mdxComponents, routingSpec, children, }?: BootProps) => void;

export { type BootProps, CATCH_ALL_ROUTING_SPEC, DEFAULT_ROUTING_SPEC, TinkerableApp, boot };
