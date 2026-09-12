import "../chunk-VHAA22YE.js";
import { jsx } from "react/jsx-runtime";
import { use } from "react";
import { Admonition } from "./Admonition";
import { FS_PREFIX, LinkSpaceContext, resolveLinkTarget } from "../linkSpace";
import { splitHash } from "../urlUtils";
import { HeadingAnchor } from "./HeadingAnchor";
import { Link } from "./Link";
import { WikiLink } from "./WikiLink";
import { InternalLink, Link as Link2 } from "./Link";
import { Admonition as Admonition2 } from "./Admonition";
import { HeadingAnchor as HeadingAnchor2 } from "./HeadingAnchor";
import { WikiLink as WikiLink2 } from "./WikiLink";
const DEFAULT_MDX_COMPONENTS = {
  a({
    href,
    children,
    ...properties
  }) {
    const { corpusRoot } = use(LinkSpaceContext);
    let mapped = href;
    if (href && (href.startsWith(FS_PREFIX) || corpusRoot !== null && href.startsWith("/"))) {
      const [pathPart, frag] = splitHash(href);
      const resolution = resolveLinkTarget(pathPart, { corpusRoot });
      if (resolution.state !== "resolved") {
        return /* @__PURE__ */ jsx("span", { className: "ir-link-broken", "data-state": "broken", title: `Invalid ${FS_PREFIX} link: ${href}`, children });
      }
      mapped = `${resolution.path}${frag ? `#${frag}` : ""}`;
    }
    return /* @__PURE__ */ jsx(Link, { href: mapped, ...properties, children });
  },
  Admonition,
  HeadingAnchor,
  WikiLink
};
export {
  Admonition2 as Admonition,
  DEFAULT_MDX_COMPONENTS,
  HeadingAnchor2 as HeadingAnchor,
  InternalLink,
  Link2 as Link,
  WikiLink2 as WikiLink
};
//# sourceMappingURL=MDXComponents.js.map