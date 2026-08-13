import "../chunk-VHAA22YE.js";
import { jsx } from "react/jsx-runtime";
import { Suspense, use } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { ModuleCacheContext } from "../moduleCache";
import { defaultErrorComponent, defaultLoadingComponent } from "./defaults";
import { IncludeModeContext, RenderExportedComponentContext } from "./includeContexts";
import { SafeInclude } from "./SafeInclude";
import { IncludeModeContext as IncludeModeContext2, RenderExportedComponentContext as RenderExportedComponentContext2 } from "./includeContexts";
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
  baseModule,
  mode,
  components
}) => {
  const contextMode = use(IncludeModeContext);
  const moduleCache = use(ModuleCacheContext);
  if ((mode ?? contextMode) === "interpreted") {
    return /* @__PURE__ */ jsx(
      SafeInclude,
      {
        filename,
        components,
        LoadingComponent,
        ErrorComponent
      }
    );
  }
  const evaluationContextPromise = moduleCache.getEvaluationContext(filename, baseModule ?? module);
  return /* @__PURE__ */ jsx(ErrorBoundary, { fallbackRender: ErrorComponent, children: /* @__PURE__ */ jsx(Suspense, { fallback: /* @__PURE__ */ jsx(LoadingComponent, {}), children: /* @__PURE__ */ jsx(RenderExportedComponent, { evaluationContextPromise, exportedSymbol }) }) });
};
export {
  Include,
  IncludeModeContext2 as IncludeModeContext,
  RenderExportedComponent,
  RenderExportedComponentContext2 as RenderExportedComponentContext
};
//# sourceMappingURL=Include.js.map