import "../chunk-VHAA22YE.js";
import { jsx } from "react/jsx-runtime";
import { use, useCallback } from "react";
import { scrollToId } from "../scrollToId";
import { TinkerableContext } from "../TinkerableContext";
import { constructOuterUrl } from "../urlUtils";
import { FragmentLink } from "./Link";
const HeadingAnchor = ({
  id,
  ...rest
}) => {
  const ctx = use(TinkerableContext);
  const onAnchorClick = useCallback(
    (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      if (id) scrollToId(id);
    },
    [id]
  );
  if (!id) return null;
  const href = ctx?.navigationState ? constructOuterUrl(ctx.outerHref, `#${id}`, ctx.navigationState) : `#${id}`;
  return /* @__PURE__ */ jsx(
    FragmentLink,
    {
      className: "ir-heading-anchor",
      href,
      onClick: onAnchorClick,
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