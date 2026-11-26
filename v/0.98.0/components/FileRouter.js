import "../chunk-VHAA22YE.js";
import { jsx } from "react/jsx-runtime";
import { Suspense, use, useContext, useMemo } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { TinkerableContext } from "../TinkerableContext.js";
import { underAppRoot } from "../urlUtils.js";
import { defaultErrorComponent, defaultLoadingComponent } from "./defaults.js";
import { isDirectoryPath, namesDirectory } from "../directoryListing.js";
import { DirectoryView } from "./DirectoryView.js";
import { Include } from "./Include.js";
import { Prose } from "./Prose.js";
import { isProseFile } from "../proseStyles.js";
const FileRouter = ({
  LoadingComponent = defaultLoadingComponent,
  ErrorComponent = defaultErrorComponent
} = {}) => {
  const {
    navigationState: { pathParameters, sandboxPath }
  } = useContext(TinkerableContext);
  const filename = pathParameters?.["*"];
  if (!filename) {
    return /* @__PURE__ */ jsx(
      ErrorComponent,
      {
        error: new Error(`No filename could be extracted from ${sandboxPath}`),
        resetErrorBoundary: () => {
        }
      }
    );
  }
  if (namesDirectory(filename)) {
    return /* @__PURE__ */ jsx(DirectoryView, { path: filename, LoadingComponent, ErrorComponent });
  }
  return /* @__PURE__ */ jsx(FileOrDirectory, { filename, LoadingComponent, ErrorComponent });
};
const FileOrDirectory = ({ filename, LoadingComponent, ErrorComponent }) => {
  const isDirectoryPromise = useMemo(() => isDirectoryPath(filename), [filename]);
  return /* @__PURE__ */ jsx(ErrorBoundary, { fallbackRender: ErrorComponent, resetKeys: [filename], children: /* @__PURE__ */ jsx(Suspense, { fallback: /* @__PURE__ */ jsx(LoadingComponent, {}), children: /* @__PURE__ */ jsx(
    ResolvedPath,
    {
      filename,
      isDirectoryPromise,
      LoadingComponent,
      ErrorComponent
    }
  ) }) });
};
const ResolvedPath = ({
  filename,
  isDirectoryPromise,
  LoadingComponent,
  ErrorComponent
}) => {
  if (use(isDirectoryPromise)) {
    return /* @__PURE__ */ jsx(DirectoryView, { path: filename, LoadingComponent, ErrorComponent });
  }
  const content = /* @__PURE__ */ jsx(
    Include,
    {
      filename: underAppRoot(filename),
      LoadingComponent,
      ErrorComponent,
      baseModule: module
    }
  );
  return isProseFile(filename) ? /* @__PURE__ */ jsx(Prose, { filename, children: content }) : content;
};
export {
  FileRouter
};
//# sourceMappingURL=FileRouter.js.map