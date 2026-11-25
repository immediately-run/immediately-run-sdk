import "../chunk-VHAA22YE.js";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { Suspense, use, useMemo } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { readDirectoryListing } from "../directoryListing.js";
import { underAppRoot } from "../urlUtils.js";
import { defaultErrorComponent, defaultLoadingComponent } from "./defaults.js";
import { Include } from "./Include.js";
import { Link } from "./Link.js";
import { Prose } from "./Prose.js";
const DirectoryListingView = ({ listingPromise }) => {
  const { dir, parent, entries, readme } = use(listingPromise);
  return /* @__PURE__ */ jsxs(Prose, { filename: readme?.slice(1), children: [
    /* @__PURE__ */ jsxs("nav", { "aria-label": `Contents of ${dir}`, "data-ir-directory": dir, children: [
      /* @__PURE__ */ jsx("h1", { children: dir }),
      /* @__PURE__ */ jsxs("ul", { children: [
        parent !== null && /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsx(Link, { href: parent, children: "../" }) }),
        entries.map((entry) => /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsx(Link, { href: entry.path, children: entry.isDirectory ? `${entry.name}/` : entry.name }) }, entry.path))
      ] }),
      entries.length === 0 && /* @__PURE__ */ jsx("p", { children: "This folder is empty." })
    ] }),
    readme && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("hr", {}),
      /* @__PURE__ */ jsx(Include, { filename: underAppRoot(readme) })
    ] })
  ] });
};
const DirectoryView = ({
  path,
  LoadingComponent = defaultLoadingComponent,
  ErrorComponent = defaultErrorComponent
}) => {
  const listingPromise = useMemo(() => readDirectoryListing(path), [path]);
  return /* @__PURE__ */ jsx(ErrorBoundary, { fallbackRender: ErrorComponent, resetKeys: [path], children: /* @__PURE__ */ jsx(Suspense, { fallback: /* @__PURE__ */ jsx(LoadingComponent, {}), children: /* @__PURE__ */ jsx(DirectoryListingView, { listingPromise }) }) });
};
export {
  DirectoryView
};
//# sourceMappingURL=DirectoryView.js.map