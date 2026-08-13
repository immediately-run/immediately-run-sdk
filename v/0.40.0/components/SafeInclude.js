import "../chunk-VHAA22YE.js";
import { jsx } from "react/jsx-runtime";
import { Suspense, use, useMemo } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { openAppFs } from "../fs";
import { getAppMountPath } from "../mounts";
import { useMDXComponents } from "../MDXProvider";
import { SafeContent } from "../safeContent/SafeContent";
import { createSourceCache } from "../sourceCache";
import { RenderExportedComponentContext } from "./includeContexts";
import { defaultErrorComponent, defaultLoadingComponent } from "./defaults";
function stripFrontmatter(source) {
  return source.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/, "");
}
function appMountRelative(filename) {
  const root = getAppMountPath().replace(/\/+$/, "");
  const abs = filename.startsWith(root + "/") ? filename.slice(root.length) : filename;
  return abs.replace(/^\/+/, "");
}
const defaultSources = createSourceCache(
  (path) => openAppFs().readFile(path, "utf8")
);
function InterpretedBody({
  filename,
  components,
  readSource
}) {
  const sources = useMemo(
    () => readSource ? createSourceCache(readSource) : defaultSources,
    [readSource]
  );
  const raw = use(sources.read(appMountRelative(filename)));
  const provided = useMDXComponents(components);
  const body = stripFrontmatter(raw);
  return (
    // Publishing the included file's path is what lets the WikiLink resolver know which file
    // a relative `[[target]]` (and its `#sec-…` fragment) is relative TO — the same context
    // the compiled path publishes from the module's evaluation.
    /* @__PURE__ */ jsx(
      RenderExportedComponentContext,
      {
        value: { evaluationContext: { evaluation: { module: { filepath: filename } } } },
        children: /* @__PURE__ */ jsx(SafeContent, { source: body, components: provided })
      }
    )
  );
}
const SafeInclude = ({
  filename,
  components,
  readSource,
  LoadingComponent = defaultLoadingComponent,
  ErrorComponent = defaultErrorComponent
}) => (
  // Same boundary shape as the compiled path: a file that fails to read renders the error
  // component rather than taking down the tree that included it.
  /* @__PURE__ */ jsx(ErrorBoundary, { fallbackRender: ErrorComponent, children: /* @__PURE__ */ jsx(Suspense, { fallback: /* @__PURE__ */ jsx(LoadingComponent, {}), children: /* @__PURE__ */ jsx(InterpretedBody, { filename, components, readSource }) }) })
);
export {
  SafeInclude,
  appMountRelative,
  stripFrontmatter
};
//# sourceMappingURL=SafeInclude.js.map