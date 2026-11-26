import "../chunk-VHAA22YE.js";
import { jsx } from "react/jsx-runtime";
import { use } from "react";
import { isBrowserGestureClick, useComposedAnchorClick } from "../anchorClick.js";
import { navigate } from "../routing.js";
import { scrollToId } from "../scrollToId.js";
import { TinkerableContext } from "../TinkerableContext.js";
import { constructOuterUrl, displayHref, isInternalHref } from "../urlUtils.js";
const FragmentLink = ({
  href,
  children,
  onClick,
  ...props
}) => {
  const clickHandler = useComposedAnchorClick(
    onClick,
    (e) => {
      if (href && href.startsWith("#")) {
        e.preventDefault();
        scrollToId(href.slice(1));
      }
    },
    [href]
  );
  return /* @__PURE__ */ jsx("a", { href, onClick: clickHandler, ...props, children });
};
const InternalLink = ({
  href,
  navigateHref,
  children,
  onClick,
  target,
  ...props
}) => {
  const clickHandler = useComposedAnchorClick(
    onClick,
    (e) => {
      if (!href) return;
      if (isBrowserGestureClick(e)) return;
      if (target && target !== "_self") return;
      e.preventDefault();
      navigate(navigateHref ?? href);
    },
    [href, navigateHref, target]
  );
  return /* @__PURE__ */ jsx("a", { ...props, href, target, onClick: clickHandler, children });
};
const Link = ({
  href,
  children,
  ...properties
}) => {
  const context = use(TinkerableContext);
  const { outerHref, navigationState } = context;
  if (href && href.startsWith("#")) {
    return /* @__PURE__ */ jsx(FragmentLink, { href, ...properties, children });
  }
  if (href && isInternalHref(outerHref, href, navigationState)) {
    const targetHref = constructOuterUrl(outerHref, href, navigationState);
    return /* @__PURE__ */ jsx(InternalLink, { ...properties, href: displayHref(targetHref, context), navigateHref: targetHref, children });
  } else {
    return /* @__PURE__ */ jsx("a", { ...{ href, ...properties }, children });
  }
};
export {
  FragmentLink,
  InternalLink,
  Link
};
//# sourceMappingURL=Link.js.map