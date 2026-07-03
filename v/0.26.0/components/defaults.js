import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { Spinner } from "../loading";
const defaultLoadingComponent = () => /* @__PURE__ */ jsx(
  "div",
  {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
      height: "100%",
      minHeight: 48
    },
    children: /* @__PURE__ */ jsx(Spinner, {})
  }
);
const defaultErrorComponent = ({ error }) => /* @__PURE__ */ jsxs(Fragment, { children: [
  "ERROR ",
  String(error)
] });
export {
  defaultErrorComponent,
  defaultLoadingComponent
};
//# sourceMappingURL=defaults.js.map