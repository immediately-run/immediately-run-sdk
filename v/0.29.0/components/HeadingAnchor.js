import { jsx } from "react/jsx-runtime";
const HeadingAnchor = ({
  id,
  ...rest
}) => {
  if (!id) return null;
  return /* @__PURE__ */ jsx(
    "a",
    {
      className: "ir-heading-anchor",
      href: `#${id}`,
      "aria-label": "Permalink to this heading",
      ...rest,
      children: /* @__PURE__ */ jsx("span", { "aria-hidden": "true", children: "#" })
    }
  );
};
export {
  HeadingAnchor
};
//# sourceMappingURL=HeadingAnchor.js.map