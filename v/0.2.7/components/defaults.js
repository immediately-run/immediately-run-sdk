import { Fragment, jsx, jsxs } from "react/jsx-runtime";
const defaultLoadingComponent = () => /* @__PURE__ */ jsx(Fragment, { children: "loading..." });
const defaultErrorComponent = ({ error }) => /* @__PURE__ */ jsxs(Fragment, { children: [
  "ERROR ",
  String(error)
] });
export {
  defaultErrorComponent,
  defaultLoadingComponent
};
//# sourceMappingURL=defaults.js.map