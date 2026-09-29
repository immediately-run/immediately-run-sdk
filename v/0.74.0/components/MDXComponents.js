import "../chunk-VHAA22YE.js";
import { jsx } from "react/jsx-runtime";
import { use } from "react";
import { Admonition } from "./Admonition.js";
import { FS_PREFIX, LinkSpaceContext, resolveLinkTarget } from "../linkSpace.js";
import { splitHash } from "../urlUtils.js";
import { HeadingAnchor } from "./HeadingAnchor.js";
import { Link } from "./Link.js";
import { WikiLink } from "./WikiLink.js";
import { InternalLink, Link as Link2 } from "./Link.js";
import { Admonition as Admonition2 } from "./Admonition.js";
import { HeadingAnchor as HeadingAnchor2 } from "./HeadingAnchor.js";
import { WikiLink as WikiLink2 } from "./WikiLink.js";
const DEFAULT_MDX_COMPONENTS = {
  a({
    href,
    children,
    ...properties
  }) {
    const space = use(LinkSpaceContext);
    const bundleRoot = space.bundleRoot !== void 0 ? space.bundleRoot : space.corpusRoot ?? null;
    let mapped = href;
    if (href && (href.startsWith(FS_PREFIX) || bundleRoot !== null && href.startsWith("/"))) {
      const [pathPart, frag] = splitHash(href);
      const resolution = resolveLinkTarget(pathPart, { bundleRoot });
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