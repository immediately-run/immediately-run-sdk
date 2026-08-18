import { FC, ReactNode, StrictMode, useEffect, useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { emitMarkerOnce } from './markers';

import { ErrorNotFound } from './components/errors';
import { FileRouter } from './components/FileRouter';
import { MainContent } from './components/MainContent';
import { DEFAULT_MDX_COMPONENTS } from './components/MDXComponents';
import { ScrollAfterNavigation } from './components/ScrollAfterNavigation';
import { getInitialContext, updateContext } from './contextUtils';
import { getInjectedMetadataEmitter, resolveMetadataSource } from './injectedBundler';
import { MDXProvider } from './MDXProvider';
import { ModuleCache, ModuleCacheContextProvider } from './moduleCache';
import { Router } from './routing';
import type { RoutingSpec } from './RoutingSpec';
import { FilesMetadata } from './sandboxTypes';
import { addListener } from './sandboxUtils';
import { TinkerableContext, TinkerableState } from './TinkerableContext';
import { FILES_PREFIX } from './urlUtils';
import { METADATA_UPDATE, URLCHANGE } from './generated/protocol';

/** A map of MDX component overrides, or a function that receives the platform
 *  {@link DEFAULT_MDX_COMPONENTS} and returns the full map to use. */
export type MdxComponents =
  | Record<string, FC>
  | ((defaults: Record<string, FC>) => Record<string, FC>);

/**
 * Resolve the effective MDX component map from a {@link BootProps.mdxComponents}
 * value (MARKDOWN_SYNTAX_SPEC §11.3):
 * - `undefined` → the platform {@link DEFAULT_MDX_COMPONENTS} (same reference).
 * - a **function** → the full-replace escape hatch, handed the defaults.
 * - a **map** → merged *over* the defaults (`{ ...defaults, ...map }`), so
 *   overriding one component keeps the rest — the phantom-defaults invariant
 *   (§11.2) that stops the MDX missing-reference guard from firing.
 */
export const resolveMdxComponents = (mdxComponents?: MdxComponents): Record<string, FC> =>
  mdxComponents === undefined
    ? (DEFAULT_MDX_COMPONENTS as Record<string, FC>)
    : typeof mdxComponents === 'function'
      ? mdxComponents(DEFAULT_MDX_COMPONENTS as Record<string, FC>)
      : { ...(DEFAULT_MDX_COMPONENTS as Record<string, FC>), ...mdxComponents };

/** Options for {@link boot}: MDX overrides, a route table, or an app root. */
export type BootProps = {
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

const updateAlreadyApplied = (filesMetadata: FilesMetadata, update: FilesMetadata) => {
  for (let [key, value] of Object.entries(update)) {
    if (filesMetadata[key] !== value) {
      return false;
    }
  }
  return true;
};

/** The app shell {@link boot} renders: holds navigation state, subscribes to host
 *  URL + metadata pushes, and renders `children` or the route `<Router />`. */
export const TinkerableApp = ({
  routingSpec,
  children,
}: {
  routingSpec: RoutingSpec;
  children?: ReactNode;
}) => {
  const [context, setContext] = useState<TinkerableState>(getInitialContext(routingSpec));
  useEffect(() => {
    const removeListener = addListener(URLCHANGE, ({ url }) => {
      setContext((context) => {
        const updatedContext = updateContext(context, url);
        if (updatedContext !== context) {
          console.log(
            `[Sandbox] Updating path from ${context.navigationState.sandboxPath} to ${updatedContext.navigationState.sandboxPath}`
          );
        }
        return updatedContext;
      });
    });
    return removeListener;
  }, [setContext]);
  useEffect(() => {
    // Phase 5 dual-mode (SDK_PACKAGING_SPEC §4/§8): prefer the injected bundler's
    // metadata emitter (the live path, byte-identical); when the SDK is npm-fetched
    // with no injection, `event` is undefined so `addListener` receives
    // 'metadata-update' over the §4 transport instead, and `enable` is a no-op.
    const source = resolveMetadataSource(getInjectedMetadataEmitter());
    const dispose = addListener(
      METADATA_UPDATE,
      ({ update }: Record<string, any>) => {
        setContext((prevContext) =>
          updateAlreadyApplied(prevContext.filesMetadata, update)
            ? prevContext
            : {
                ...prevContext,
                filesMetadata: {
                  // TODO: file deletion!
                  ...prevContext.filesMetadata,
                  ...update,
                },
              }
        );
      },
      source.event
    );
    source.enable();
    return dispose;
  }, [setContext]);

  return (
    <TinkerableContext value={context}>
      {/* Capability C: lands cross-page `#fragment` deep-links on their section
          after the destination tree mounts, uniform for every MDX app (§13.5). */}
      <ScrollAfterNavigation />
      {children ?? <Router />}
    </TinkerableContext>
  );
};

// Boot marker emitter (LOAD_PROFILING_SPEC §3, R3-46). Rendered at the top of the
// app tree so its layout effect fires on the FIRST root-render commit: that instant
// is `ir.fmp` (the content is in the DOM, about to paint) and the baseline for
// `ir.interactive` (the host treats a forwarded `ir.interactive` as the root-commit
// signal and resolves `max(commit, reportReady)` — LP2-3 — so this can only ever be
// delayed by an app's `reportReady()`, never advanced). Emitted in canonical stream
// order (fmp then interactive); idempotent per name (StrictMode-safe). Renders null.
const BootMarkers = (): null => {
  useLayoutEffect(() => {
    emitMarkerOnce('ir.fmp');
    emitMarkerOnce('ir.interactive');
  }, []);
  return null;
};

/** The default route table when `boot` is called with no `routingSpec`/`children`:
 *  `/` → main content, `/files/<path>` → the file router, else not-found.
 *  Re-expressed with path templates (SANDBOX_ROUTING_SPEC §7); the file path
 *  surfaces under the `*` wildcard. The catch-all stays a raw RegExp — the
 *  escape hatch — so it anchors `.+` (a non-empty path) exactly as before. */
export const DEFAULT_ROUTING_SPEC: RoutingSpec = {
  routes: [
    { name: 'MainContent', pattern: '/', element: <MainContent /> },
    { name: 'FileRouter', pattern: `${FILES_PREFIX}/*`, element: <FileRouter /> },
    { name: 'ErrorNotFound', pattern: /^(?<path>.+)$/, element: <ErrorNotFound /> },
  ],
};

/**
 * Matches any `sandboxPath` so navigation context can be built without a route
 * table. Used when {@link boot} is given `children` (the app owns dispatch via
 * `<Routes>`); the catch-all's `element` is never rendered (children are).
 */
export const CATCH_ALL_ROUTING_SPEC: RoutingSpec = {
  routes: [{ name: 'AppRoot', pattern: /^.*$/, element: null }],
};

/**
 * Mount an immediately.run app into the sandbox `#root`. The entry point every
 * app calls from `index.tsx`: wires the MDX, module-cache, and navigation
 * providers, then renders the route table (`routingSpec`) or your `children`.
 */
export const boot = ({
  mdxComponents,
  routingSpec,
  children,
}: BootProps = {}) => {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('boot requires root HTML element to exist');
  }
  const resolvedComponents = resolveMdxComponents(mdxComponents);
  // `children` own dispatch, so a catch-all keeps navigation working without a
  // table; otherwise fall back to the default file/main-content routes.
  const spec = routingSpec ?? (children ? CATCH_ALL_ROUTING_SPEC : DEFAULT_ROUTING_SPEC);
  const moduleCache = new ModuleCache();
  const root = createRoot(rootElement);
  root.render(
    <StrictMode>
      <ModuleCacheContextProvider moduleCache={moduleCache}>
        <MDXProvider components={resolvedComponents}>
          <BootMarkers />
          <TinkerableApp routingSpec={spec}>{children}</TinkerableApp>
        </MDXProvider>
      </ModuleCacheContextProvider>
    </StrictMode>
  );
};
