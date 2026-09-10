import "./chunk-VHAA22YE.js";
import { useCallback } from "react";
const isBrowserGestureClick = (event) => event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
const useComposedAnchorClick = (onClick, intercept, interceptDeps) => useCallback(
  (e) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    intercept(e);
  },
  [onClick, ...interceptDeps]
);
export {
  isBrowserGestureClick,
  useComposedAnchorClick
};
//# sourceMappingURL=anchorClick.js.map