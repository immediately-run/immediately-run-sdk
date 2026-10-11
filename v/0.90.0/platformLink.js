import "./chunk-VHAA22YE.js";
import { jsx } from "react/jsx-runtime";
import { use } from "react";
import { isBrowserGestureClick, useComposedAnchorClick } from "./anchorClick.js";
import { navigate } from "./routing.js";
import { TinkerableContext } from "./TinkerableContext.js";
import { platformHref } from "./urlUtils.js";
const usePlatformHref = () => {
  const { outerHref } = use(TinkerableContext);
  return (path) => platformHref(outerHref, path);
};
const SAME_CONTEXT_TARGETS = /* @__PURE__ */ new Set(["_top", "_self", "_parent"]);
function PlatformLink({ path, children, onClick, target = "_top", ...rest }) {
  const { outerHref } = use(TinkerableContext);
  const href = platformHref(outerHref, path);
  const clickHandler = useComposedAnchorClick(
    onClick,
    (event) => {
      if (isBrowserGestureClick(event)) return;
      if (!SAME_CONTEXT_TARGETS.has(target)) return;
      if (!outerHref) return;
      event.preventDefault();
      navigate(href);
    },
    [href, outerHref, target]
  );
  return /* @__PURE__ */ jsx("a", { ...rest, href, target, onClick: clickHandler, children });
}
export {
  PlatformLink,
  usePlatformHref
};
//# sourceMappingURL=platformLink.js.map