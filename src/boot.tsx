import { FC, ReactNode, StrictMode, useEffect, useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { emitMarkerOnce } from './markers';

import { ErrorNotFound } from './components/errors';
import { FileRouter } from './components/FileRouter';
import { MainContent } from './components/MainContent';
import { DEFAULT_MDX_COMPONENTS } from './components/MDXComponents';
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

export type BootProps = {
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

const updateAlreadyApplied = (filesMetadata: FilesMetadata, update: FilesMetadata) => {
  for (let [key, value] of Object.entries(update)) {
    if (filesMetadata[key] !== value) {
      return false;
    }
  }
  return true;
};

export const TinkerableApp = ({
  routingSpec,
  children,
}: {
  routingSpec: RoutingSpec;
  children?: ReactNode;
}) => {
  const [context, setContext] = useState<TinkerableState>(getInitialContext(routingSpec));
  useEffect(() => {
    const removeListener = addListener('urlchange', ({ url }) => {
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
      'metadata-update',
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

// from: https://stackoverflow.com/a/63838890
const escapeForRegexp = (str: string) => str.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&');

export const DEFAULT_ROUTING_SPEC: RoutingSpec = {
  routes: [
    { name: 'MainContent', pattern: /^\/$/, element: <MainContent /> },
    {
      name: 'FileRouter',
      pattern: new RegExp(`^${escapeForRegexp(FILES_PREFIX)}(?<filename>\/.+)$`),
      element: <FileRouter />,
    },
    { name: 'ErrorNotFound', pattern: /^(?<path>.+)$/, element: <ErrorNotFound /> },
  ],
};

// Matches any sandboxPath so navigation context can be built without a route
// table. Used when `boot` is given `children` (the app owns dispatch via
// `<Routes>`); the catch-all's `element` is never rendered (children are).
export const CATCH_ALL_ROUTING_SPEC: RoutingSpec = {
  routes: [{ name: 'AppRoot', pattern: /^.*$/, element: null }],
};

export const boot = ({
  mdxComponents = DEFAULT_MDX_COMPONENTS,
  routingSpec,
  children,
}: BootProps = {}) => {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('boot requires root HTML element to exist');
  }
  // `children` own dispatch, so a catch-all keeps navigation working without a
  // table; otherwise fall back to the default file/main-content routes.
  const spec = routingSpec ?? (children ? CATCH_ALL_ROUTING_SPEC : DEFAULT_ROUTING_SPEC);
  const moduleCache = new ModuleCache();
  const root = createRoot(rootElement);
  root.render(
    <StrictMode>
      <ModuleCacheContextProvider moduleCache={moduleCache}>
        <MDXProvider components={mdxComponents}>
          <BootMarkers />
          <TinkerableApp routingSpec={spec}>{children}</TinkerableApp>
        </MDXProvider>
      </ModuleCacheContextProvider>
    </StrictMode>
  );
};
