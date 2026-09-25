import "../chunk-VHAA22YE.js";
import { jsx } from "react/jsx-runtime";
import { use } from "react";
import { Link } from "./Link.js";
import { RenderExportedComponentContext } from "./Include.js";
import { TinkerableContext } from "../TinkerableContext.js";
import { splitHash } from "../urlUtils.js";
import { FS_PREFIX, LinkSpaceContext, resolveLinkTarget } from "../linkSpace.js";
const labelFromTarget = (target) => {
  const base = target.split(/[\\/]/).pop() ?? target;
  return base.replace(/\.mdx?$/i, "") || target;
};
const WikiLink = ({
  target,
  label,
  children,
  ...rest
}) => {
  const { filesMetadata } = use(TinkerableContext);
  const space = use(LinkSpaceContext);
  const bundleRoot = space.bundleRoot !== void 0 ? space.bundleRoot : space.corpusRoot ?? null;
  const renderContext = use(RenderExportedComponentContext);
  const currentFile = renderContext?.evaluationContext?.evaluation?.module?.filepath;
  const rawTarget = target ?? "";
  const [pathPart, frag] = splitHash(rawTarget);
  const text = children ?? label ?? (rawTarget ? labelFromTarget(pathPart || frag || rawTarget) : "");
  if (!rawTarget) {
    return /* @__PURE__ */ jsx("span", { className: "ir-wikilink", ...rest, children: text });
  }
  if (pathPart === "" && frag) {
    return /* @__PURE__ */ jsx(Link, { href: `#${frag}`, className: "ir-wikilink", "data-state": "anchor", ...rest, children: text });
  }
  const resolution = resolveLinkTarget(pathPart, { currentFile, bundleRoot });
  if (resolution.state === "invalid") {
    return /* @__PURE__ */ jsx(
      "span",
      {
        className: "ir-wikilink ir-wikilink-broken",
        "data-state": "broken",
        title: `Invalid ${FS_PREFIX} target: ${pathPart}`,
        ...rest,
        children: text
      }
    );
  }
  const resolved = resolution.state === "resolved" ? resolution.path : void 0;
  const files = filesMetadata ?? {};
  const loaded = Object.keys(files).length > 0;
  if (resolved !== void 0) {
    if (currentFile && resolved === currentFile) {
      if (frag) {
        return /* @__PURE__ */ jsx(Link, { href: `#${frag}`, className: "ir-wikilink", "data-state": "anchor", ...rest, children: text });
      }
      return /* @__PURE__ */ jsx("span", { className: "ir-wikilink ir-wikilink-self", "data-state": "self", ...rest, children: text });
    }
    const exists = !loaded || resolved in files;
    if (!exists) {
      return /* @__PURE__ */ jsx("span", { className: "ir-wikilink ir-wikilink-broken", "data-state": "broken", title: `No file at ${resolved}`, ...rest, children: text });
    }
  }
  const translated = pathPart.startsWith(FS_PREFIX) || bundleRoot !== null && pathPart.startsWith("/");
  const href = translated && resolved !== void 0 ? `${resolved}${frag ? `#${frag}` : ""}` : rawTarget;
  return /* @__PURE__ */ jsx(Link, { href, className: "ir-wikilink", "data-state": "resolved", ...rest, children: text });
};
export {
  WikiLink
};
//# sourceMappingURL=WikiLink.js.map