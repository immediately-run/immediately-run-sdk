import "../chunk-VHAA22YE.js";
import { jsx } from "react/jsx-runtime";
import { Admonition } from "./Admonition";
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
    return /* @__PURE__ */ jsx(Link, { href, ...properties, children });
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