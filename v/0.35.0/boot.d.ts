import * as react from 'react';
import { FC, ReactNode } from 'react';
import { RoutingSpec } from './RoutingSpec.js';

/** A map of MDX component overrides, or a function that receives the platform
 *  {@link DEFAULT_MDX_COMPONENTS} and returns the full map to use. */
type MdxComponents = Record<string, FC> | ((defaults: Record<string, FC>) => Record<string, FC>);
/**
 * Resolve the effective MDX component map from a {@link BootProps.mdxComponents}
 * value (MARKDOWN_SYNTAX_SPEC §11.3):
 * - `undefined` → the platform {@link DEFAULT_MDX_COMPONENTS} (same reference).
 * - a **function** → the full-replace escape hatch, handed the defaults.
 * - a **map** → merged *over* the defaults (`{ ...defaults, ...map }`), so
 *   overriding one component keeps the rest — the phantom-defaults invariant
 *   (§11.2) that stops the MDX missing-reference guard from firing.
 */
declare const resolveMdxComponents: (mdxComponents?: MdxComponents) => Record<string, FC>;
/** Options for {@link boot}: MDX overrides, a route table, or an app root. */
type BootProps = {
    /**
     * MDX component overrides. A **map** is *merged over* the platform defaults
     * ({@link DEFAULT_MDX_COMPONENTS}) — so overriding `WikiLink` alone keeps the
     * default `a` and `Admonition` (MARKDOWN_SYNTAX_SPEC §11.3). Pass a **function**
     * `(defaults) => map` as the full-replace escape hatch when you want complete
     * control over the set.
     */
    mdxComponents?: MdxComponents;
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
}) => react.JSX.Element;
/** The default route table when `boot` is called with no `routingSpec`/`children`:
 *  `/` → main content, `/files/<path>` → the file router, else not-found.
 *  Re-expressed with path templates (SANDBOX_ROUTING_SPEC §7); the file path
 *  surfaces under the `*` wildcard. The catch-all stays a raw RegExp — the
 *  escape hatch — so it anchors `.+` (a non-empty path) exactly as before. */
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

export { type BootProps, CATCH_ALL_ROUTING_SPEC, DEFAULT_ROUTING_SPEC, type MdxComponents, TinkerableApp, boot, resolveMdxComponents };
