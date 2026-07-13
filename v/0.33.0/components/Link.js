import { jsx } from "react/jsx-runtime";
import { use, useCallback } from "react";
import { navigate } from "../routing";
import { scrollToId } from "../scrollToId";
import { TinkerableContext } from "../TinkerableContext";
import { constructOuterUrl, isInternalHref } from "../urlUtils";
const FragmentLink = ({
  href,
  children,
  onClick,
  ...props
}) => {
  const clickHandler = useCallback(
    (e) => {
      onClick?.(e);
      if (e.defaultPrevented) return;
      if (href && href.startsWith("#")) {
        e.preventDefault();
        scrollToId(href.slice(1));
      }
    },
    [href, onClick]
  );
  return /* @__PURE__ */ jsx("a", { href, onClick: clickHandler, ...props, children });
};
const InternalLink = ({
  href,
  children,
  ...props
}) => {
  const clickHandler = useCallback(
    (e) => {
      if (href) {
        e.preventDefault();
        navigate(href);
      }
    },
    [href]
  );
  return /* @__PURE__ */ jsx("a", { href, onClick: clickHandler, ...props, children });
};
const Link = ({
  href,
  children,
  ...properties
}) => {
  const { outerHref, navigationState } = use(TinkerableContext);
  if (href && href.startsWith("#")) {
    return /* @__PURE__ */ jsx(FragmentLink, { href, ...properties, children });
  }
  if (href && isInternalHref(outerHref, href, navigationState)) {
    const targetHref = constructOuterUrl(outerHref, href, navigationState);
    return /* @__PURE__ */ jsx(InternalLink, { href: targetHref, ...properties, children });
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