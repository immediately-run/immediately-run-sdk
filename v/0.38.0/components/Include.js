import "../chunk-VHAA22YE.js";
import { jsx } from "react/jsx-runtime";
import { Suspense, createContext, use } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { ModuleCacheContext } from "../moduleCache";
import { defaultErrorComponent, defaultLoadingComponent } from "./defaults";
const RenderExportedComponentContext = createContext(null);
const RenderExportedComponent = ({
  evaluationContextPromise,
  exportedSymbol = "default"
}) => {
  const evaluationContext = use(evaluationContextPromise);
  const Component = exportedSymbol === "*" ? evaluationContext.exports : evaluationContext.exports[exportedSymbol];
  return /* @__PURE__ */ jsx(RenderExportedComponentContext, { value: { evaluationContext }, children: /* @__PURE__ */ jsx(Component, {}) });
};
const Include = ({
  filename,
  exportedSymbol = "default",
  LoadingComponent = defaultLoadingComponent,
  ErrorComponent = defaultErrorComponent,
  baseModule
}) => {
  const moduleCache = use(ModuleCacheContext);
  const evaluationContextPromise = moduleCache.getEvaluationContext(filename, baseModule ?? module);
  return /* @__PURE__ */ jsx(ErrorBoundary, { fallbackRender: ErrorComponent, children: /* @__PURE__ */ jsx(Suspense, { fallback: /* @__PURE__ */ jsx(LoadingComponent, {}), children: /* @__PURE__ */ jsx(RenderExportedComponent, { evaluationContextPromise, exportedSymbol }) }) });
};
export {
  Include,
  RenderExportedComponent,
  RenderExportedComponentContext
};
//# sourceMappingURL=Include.js.map