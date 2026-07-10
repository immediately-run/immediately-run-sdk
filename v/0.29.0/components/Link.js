import { jsx } from "react/jsx-runtime";
import { use, useCallback } from "react";
import { navigate } from "../routing";
import { TinkerableContext } from "../TinkerableContext";
import { constructOuterUrl, isInternalHref } from "../urlUtils";
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
  if (href && isInternalHref(outerHref, href, navigationState)) {
    const targetHref = constructOuterUrl(outerHref, href, navigationState);
    return /* @__PURE__ */ jsx(InternalLink, { href: targetHref, ...properties, children });
  } else {
    return /* @__PURE__ */ jsx("a", { ...{ href, ...properties }, children });
  }
};
export {
  InternalLink,
  Link
};
//# sourceMappingURL=Link.js.map