import { jsx } from "react/jsx-runtime";
import { Admonition } from "./Admonition";
import { Link } from "./Link";
import { WikiLink } from "./WikiLink";
import { InternalLink, Link as Link2 } from "./Link";
import { Admonition as Admonition2 } from "./Admonition";
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
  WikiLink
};
export {
  Admonition2 as Admonition,
  DEFAULT_MDX_COMPONENTS,
  InternalLink,
  Link2 as Link,
  WikiLink2 as WikiLink
};
//# sourceMappingURL=MDXComponents.js.map