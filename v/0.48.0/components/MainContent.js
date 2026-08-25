import "../chunk-VHAA22YE.js";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { Suspense, use, useMemo } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { navigate, useTinkerableLink } from "../routing";
import { FILES_PREFIX, underAppRoot } from "../urlUtils";
import { defaultErrorComponent, defaultLoadingComponent } from "./defaults";
const candidates = [
  "/src/App.tsx",
  "/src/App.ts",
  "/src/App.js",
  "/App.tsx",
  "/App.ts",
  "/App.js",
  "/README.md",
  "/README.mdx",
  "/README.html"
];
const fileExists = async (path) => {
  const bundler = module.evaluation.module.bundler;
  const exists = await bundler.fs.isFile.async(underAppRoot(path));
  return [path, exists];
};
const MainContentRedirect = ({ filename }) => {
  const url = useTinkerableLink(filename);
  navigate(url);
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    "Redirecting to ",
    filename
  ] });
};
const MainContentInner = ({
  candidatesExistPromise
}) => {
  const candidatesExist = use(candidatesExistPromise);
  const filename = candidatesExist.find(([_, exists]) => exists)?.[0];
  if (!filename) {
    throw new Error(`No main content file present`);
  }
  return /* @__PURE__ */ jsx(MainContentRedirect, { filename: FILES_PREFIX + filename });
};
const MainContent = ({
  LoadingComponent = defaultLoadingComponent,
  ErrorComponent = defaultErrorComponent
} = {}) => {
  const candidatesExistPromise = useMemo(() => Promise.all(candidates.map(fileExists)), []);
  return /* @__PURE__ */ jsx(ErrorBoundary, { fallbackRender: ErrorComponent, children: /* @__PURE__ */ jsx(Suspense, { fallback: /* @__PURE__ */ jsx(LoadingComponent, {}), children: /* @__PURE__ */ jsx(MainContentInner, { candidatesExistPromise }) }) });
};
export {
  MainContent,
  MainContentInner,
  MainContentRedirect
};
//# sourceMappingURL=MainContent.js.map