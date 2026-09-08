import "./chunk-VHAA22YE.js";
import { jsx } from "react/jsx-runtime";
import { use } from "react";
import { TinkerableContext } from "./TinkerableContext";
import { platformHref } from "./urlUtils";
const usePlatformHref = () => {
  const { outerHref } = use(TinkerableContext);
  return (path) => platformHref(outerHref, path);
};
function PlatformLink({ path, children, ...rest }) {
  const platform = usePlatformHref();
  return /* @__PURE__ */ jsx("a", { ...rest, href: platform(path), target: "_top", children });
}
export {
  PlatformLink,
  usePlatformHref
};
//# sourceMappingURL=platformLink.js.map