import "../chunk-VHAA22YE.js";
import { jsx } from "react/jsx-runtime";
import { useContext } from "react";
import { TinkerableContext } from "../TinkerableContext.js";
import { underAppRoot } from "../urlUtils.js";
import { defaultErrorComponent, defaultLoadingComponent } from "./defaults.js";
import { Include } from "./Include.js";
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
  return /* @__PURE__ */ jsx(
    Include,
    {
      filename: underAppRoot(filename),
      LoadingComponent,
      ErrorComponent,
      baseModule: module
    }
  );
};
export {
  FileRouter
};
//# sourceMappingURL=FileRouter.js.map