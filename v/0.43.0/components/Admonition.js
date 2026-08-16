import "../chunk-VHAA22YE.js";
import { jsx, jsxs } from "react/jsx-runtime";
const TITLES = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  caution: "Caution"
};
const Admonition = ({
  type = "note",
  title,
  children,
  ...rest
}) => {
  const kind = String(type).toLowerCase();
  const label = title ?? TITLES[kind] ?? TITLES.note;
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: `ir-admonition ir-admonition-${kind}`,
      role: "note",
      "data-admonition": kind,
      ...rest,
      children: [
        /* @__PURE__ */ jsx("p", { className: "ir-admonition-title", children: label }),
        /* @__PURE__ */ jsx("div", { className: "ir-admonition-body", children })
      ]
    }
  );
};
export {
  Admonition
};
//# sourceMappingURL=Admonition.js.map