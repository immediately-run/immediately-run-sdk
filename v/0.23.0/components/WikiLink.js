import { jsx } from "react/jsx-runtime";
import { Link } from "./Link";
const labelFromTarget = (target) => {
  const base = target.split(/[\\/]/).pop() ?? target;
  return base.replace(/\.mdx?$/i, "") || target;
};
const WikiLink = ({
  target,
  label,
  children,
  ...rest
}) => {
  const href = target ?? "";
  const text = children ?? label ?? labelFromTarget(href);
  return /* @__PURE__ */ jsx(Link, { href, className: "ir-wikilink", ...rest, children: text });
};
export {
  WikiLink
};
//# sourceMappingURL=WikiLink.js.map