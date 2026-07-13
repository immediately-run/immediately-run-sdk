import { jsx } from "react/jsx-runtime";
import { use } from "react";
import { Link } from "./Link";
import { RenderExportedComponentContext } from "./Include";
import { TinkerableContext } from "../TinkerableContext";
import { splitHash } from "../urlUtils";
const labelFromTarget = (target) => {
  const base = target.split(/[\\/]/).pop() ?? target;
  return base.replace(/\.mdx?$/i, "") || target;
};
const normalize = (path) => {
  const out = [];
  for (const seg of path.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return "/" + out.join("/");
};
const resolveWikiTarget = (target, currentFile) => {
  if (target.startsWith("/")) return normalize(target);
  if (!currentFile) return void 0;
  const dir = currentFile.slice(0, currentFile.lastIndexOf("/"));
  return normalize(`${dir}/${target}`);
};
const WikiLink = ({
  target,
  label,
  children,
  ...rest
}) => {
  const { filesMetadata } = use(TinkerableContext);
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
  const resolved = resolveWikiTarget(pathPart, currentFile);
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
      return /* @__PURE__ */ jsx(
        "span",
        {
          className: "ir-wikilink ir-wikilink-broken",
          "data-state": "broken",
          title: `No file at ${resolved}`,
          ...rest,
          children: text
        }
      );
    }
  }
  return /* @__PURE__ */ jsx(Link, { href: rawTarget, className: "ir-wikilink", "data-state": "resolved", ...rest, children: text });
};
export {
  WikiLink
};
//# sourceMappingURL=WikiLink.js.map