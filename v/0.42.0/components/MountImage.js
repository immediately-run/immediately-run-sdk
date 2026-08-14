import "../chunk-VHAA22YE.js";
import { Fragment, jsx } from "react/jsx-runtime";
import { useObjectUrl } from "../hooks";
function MountImage({
  mount,
  relPath,
  type,
  placeholder,
  fallback,
  alt = "",
  ...imgProps
}) {
  const { url, loading, error } = useObjectUrl(mount, relPath, type ? { type } : void 0);
  if (loading) return /* @__PURE__ */ jsx(Fragment, { children: placeholder ?? null });
  if (error || !url) return /* @__PURE__ */ jsx(Fragment, { children: fallback ?? null });
  return /* @__PURE__ */ jsx("img", { src: url, alt, ...imgProps });
}
export {
  MountImage
};
//# sourceMappingURL=MountImage.js.map