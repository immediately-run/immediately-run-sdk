import "../chunk-VHAA22YE.js";
import { Fragment, jsxs } from "react/jsx-runtime";
import { useContext } from "react";
import { TinkerableContext } from "../TinkerableContext";
const ErrorNotFound = () => {
  const {
    navigationState: { pathParameters }
  } = useContext(TinkerableContext);
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    "No route registered for path ",
    pathParameters?.path ?? "(unknown)"
  ] });
};
export {
  ErrorNotFound
};
//# sourceMappingURL=errors.js.map