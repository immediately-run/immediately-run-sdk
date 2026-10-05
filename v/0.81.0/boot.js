import "./chunk-VHAA22YE.js";
import { jsx, jsxs } from "react/jsx-runtime";
import { StrictMode, useEffect, useLayoutEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { emitMarkerOnce } from "./markers.js";
import { ErrorNotFound } from "./components/errors.js";
import { FileRouter } from "./components/FileRouter.js";
import { MainContent } from "./components/MainContent.js";
import { DEFAULT_MDX_COMPONENTS } from "./components/MDXComponents.js";
import { ScrollAfterNavigation } from "./components/ScrollAfterNavigation.js";
import { getInitialContext, updateContext } from "./contextUtils.js";
import { getInjectedMetadataEmitter, resolveMetadataSource } from "./injectedBundler.js";
import { MDXProvider } from "./MDXProvider.js";
import { ModuleCache, ModuleCacheContextProvider } from "./moduleCache.js";
import { Router } from "./routing.js";
import { addListener } from "./sandboxUtils.js";
import { TinkerableContext } from "./TinkerableContext.js";
import { FILES_PREFIX } from "./urlUtils.js";
import { METADATA_UPDATE, URLCHANGE } from "./generated/protocol.js";
import { receiveNavigation } from "./entryState.js";
const resolveMdxComponents = (mdxComponents) => mdxComponents === void 0 ? DEFAULT_MDX_COMPONENTS : typeof mdxComponents === "function" ? mdxComponents(DEFAULT_MDX_COMPONENTS) : { ...DEFAULT_MDX_COMPONENTS, ...mdxComponents };
const updateAlreadyApplied = (filesMetadata, update) => {
  for (let [key, value] of Object.entries(update)) {
    if (filesMetadata[key] !== value) {
      return false;
    }
  }
  return true;
};
const TinkerableApp = ({ routingSpec, children }) => {
  const [context, setContext] = useState(getInitialContext(routingSpec));
  useEffect(() => {
    const removeListener = addListener(URLCHANGE, ({ url, entryState, back, forward }) => {
      receiveNavigation({
        state: entryState ?? void 0,
        direction: back ? "back" : forward ? "forward" : "push"
      });
      setContext((context2) => {
        const updatedContext = updateContext(context2, url);
        if (updatedContext !== context2) {
          console.log(
            `[Sandbox] Updating path from ${context2.navigationState.sandboxPath} to ${updatedContext.navigationState.sandboxPath}`
          );
        }
        return updatedContext;
      });
    });
    return removeListener;
  }, [setContext]);
  useEffect(() => {
    const source = resolveMetadataSource(getInjectedMetadataEmitter());
    const dispose = addListener(
      METADATA_UPDATE,
      ({ update }) => {
        setContext(
          (prevContext) => updateAlreadyApplied(prevContext.filesMetadata, update) ? prevContext : {
            ...prevContext,
            filesMetadata: {
              // TODO: file deletion!
              ...prevContext.filesMetadata,
              ...update
            }
          }
        );
      },
      source.event
    );
    source.enable();
    return dispose;
  }, [setContext]);
  return /* @__PURE__ */ jsxs(TinkerableContext, { value: context, children: [
    /* @__PURE__ */ jsx(ScrollAfterNavigation, {}),
    children ?? /* @__PURE__ */ jsx(Router, {})
  ] });
};
const BootMarkers = () => {
  useLayoutEffect(() => {
    emitMarkerOnce("ir.fmp");
    emitMarkerOnce("ir.interactive");
  }, []);
  return null;
};
const DEFAULT_ROUTING_SPEC = {
  routes: [
    { name: "MainContent", pattern: "/", element: /* @__PURE__ */ jsx(MainContent, {}) },
    { name: "FileRouter", pattern: `${FILES_PREFIX}/*`, element: /* @__PURE__ */ jsx(FileRouter, {}) },
    { name: "ErrorNotFound", pattern: /^(?<path>.+)$/, element: /* @__PURE__ */ jsx(ErrorNotFound, {}) }
  ]
};
const CATCH_ALL_ROUTING_SPEC = {
  routes: [{ name: "AppRoot", pattern: /^.*$/, element: null }]
};
const boot = ({ mdxComponents, routingSpec, children } = {}) => {
  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error("boot requires root HTML element to exist");
  }
  const resolvedComponents = resolveMdxComponents(mdxComponents);
  const spec = routingSpec ?? (children ? CATCH_ALL_ROUTING_SPEC : DEFAULT_ROUTING_SPEC);
  const moduleCache = new ModuleCache();
  const root = createRoot(rootElement);
  root.render(
    /* @__PURE__ */ jsx(StrictMode, { children: /* @__PURE__ */ jsx(ModuleCacheContextProvider, { moduleCache, children: /* @__PURE__ */ jsxs(MDXProvider, { components: resolvedComponents, children: [
      /* @__PURE__ */ jsx(BootMarkers, {}),
      /* @__PURE__ */ jsx(TinkerableApp, { routingSpec: spec, children })
    ] }) }) })
  );
};
export {
  CATCH_ALL_ROUTING_SPEC,
  DEFAULT_ROUTING_SPEC,
  TinkerableApp,
  boot,
  resolveMdxComponents
};
//# sourceMappingURL=boot.js.map