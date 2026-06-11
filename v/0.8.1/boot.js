import { jsx } from "react/jsx-runtime";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ErrorNotFound } from "./components/errors";
import { FileRouter } from "./components/FileRouter";
import { MainContent } from "./components/MainContent";
import { DEFAULT_MDX_COMPONENTS } from "./components/MDXComponents";
import { getInitialContext, updateContext } from "./contextUtils";
import { MDXProvider } from "./MDXProvider";
import { ModuleCache, ModuleCacheContextProvider } from "./moduleCache";
import { Router } from "./routing";
import { addListener } from "./sandboxUtils";
import { TinkerableContext } from "./TinkerableContext";
import { FILES_PREFIX } from "./urlUtils";
const updateAlreadyApplied = (filesMetadata, update) => {
  for (let [key, value] of Object.entries(update)) {
    if (filesMetadata[key] !== value) {
      return false;
    }
  }
  return true;
};
const TinkerableApp = ({ routingSpec }) => {
  const [context, setContext] = useState(getInitialContext(routingSpec));
  useEffect(() => {
    const removeListener = addListener("urlchange", ({ url }) => {
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
    const dispose = addListener(
      "metadata-update",
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
      // @ts-ignore
      module.evaluation.module.bundler.onMetadataChange
    );
    module.evaluation.module.bundler.onMetadataChangeEmitter.enable();
    return dispose;
  }, [setContext]);
  return /* @__PURE__ */ jsx(TinkerableContext, { value: context, children: /* @__PURE__ */ jsx(Router, {}) });
};
const escapeForRegexp = (str) => str.replace(/[.*+\-?^${}()|[\]\\]/g, "\\$&");
const DEFAULT_ROUTING_SPEC = {
  routes: [
    { name: "MainContent", pattern: /^\/$/, reactNode: /* @__PURE__ */ jsx(MainContent, {}) },
    {
      name: "FileRouter",
      pattern: new RegExp(`^${escapeForRegexp(FILES_PREFIX)}(?<filename>/.+)$`),
      reactNode: /* @__PURE__ */ jsx(FileRouter, {})
    },
    { name: "ErrorNotFound", pattern: /^(?<path>.+)$/, reactNode: /* @__PURE__ */ jsx(ErrorNotFound, {}) }
  ]
};
const boot = ({
  mdxComponents = DEFAULT_MDX_COMPONENTS,
  routingSpec = DEFAULT_ROUTING_SPEC
} = {}) => {
  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error("boot requires root HTML element to exist");
  }
  const moduleCache = new ModuleCache();
  const root = createRoot(rootElement);
  root.render(
    /* @__PURE__ */ jsx(StrictMode, { children: /* @__PURE__ */ jsx(ModuleCacheContextProvider, { moduleCache, children: /* @__PURE__ */ jsx(MDXProvider, { components: mdxComponents, children: /* @__PURE__ */ jsx(TinkerableApp, { routingSpec }) }) }) })
  );
};
export {
  DEFAULT_ROUTING_SPEC,
  TinkerableApp,
  boot
};
//# sourceMappingURL=boot.js.map