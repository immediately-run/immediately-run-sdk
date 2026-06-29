import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import {
  useEffect,
  useLayoutEffect,
  useState
} from "react";
const LOADING_TIMINGS = {
  /** Below this, NO spinner appears — a fast wait never flashes one (§6.2 floor). */
  spinThresholdMs: 150,
  /** The reveal cross-fade duration the host uses. */
  fadeMs: 150,
  /** One slow shimmer sweep across a placeholder. */
  shimmerMs: 1900
};
const STYLE_ID = "ir-sdk-loading-styles";
const STYLE_TEXT = `
@keyframes ir-sdk-sweep{0%{transform:translateX(-130%)}60%,100%{transform:translateX(130%)}}
@keyframes ir-sdk-spin{to{transform:rotate(360deg)}}
.ir-sdk-shim{position:relative;overflow:hidden}
.ir-sdk-shim::after{content:"";position:absolute;inset:0;background:linear-gradient(100deg,transparent 28%,rgba(127,127,127,.18) 50%,transparent 72%);transform:translateX(-130%);animation:ir-sdk-sweep ${LOADING_TIMINGS.shimmerMs}ms ease-in-out infinite}
.ir-sdk-spin{animation:ir-sdk-spin .8s linear infinite}
@media (prefers-reduced-motion:reduce){.ir-sdk-shim::after{display:none}.ir-sdk-spin{animation:none}}
`;
function ensureLoadingStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = STYLE_TEXT;
  document.head.appendChild(el);
}
function useLoadingStyles() {
  useLayoutEffect(() => {
    ensureLoadingStyles();
  }, []);
}
const PLACEHOLDER = {
  background: "rgba(127,127,127,0.20)",
  borderRadius: 6
};
function SkeletonRow({
  width = "100%",
  height = 12,
  style
}) {
  useLoadingStyles();
  return /* @__PURE__ */ jsx(
    "div",
    {
      className: "ir-sdk-shim",
      "aria-hidden": "true",
      style: { ...PLACEHOLDER, width, height, ...style }
    }
  );
}
function rows(specs) {
  return specs.map(({ key, ...s }) => /* @__PURE__ */ jsx("div", { className: "ir-sdk-shim", "aria-hidden": "true", style: { ...PLACEHOLDER, ...s } }, key));
}
function Skeleton({
  archetype = "generic",
  style
}) {
  useLoadingStyles();
  const wrap = {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: 12,
    width: "100%",
    boxSizing: "border-box",
    ...style
  };
  let body;
  switch (archetype) {
    case "panel.list":
      body = rows([0, 1, 2, 3, 4].map((key) => ({ key, height: 14 })));
      break;
    case "panel.tree":
      body = rows([0, 1, 2, 3, 4].map((key) => ({ key, height: 14, marginLeft: key % 3 * 16 })));
      break;
    case "panel.editor":
      body = rows([62, 88, 73, 41, 80].map((w, key) => ({ key, height: 11, width: `${w}%` })));
      break;
    case "panel.conversation":
      body = rows(
        [0, 1, 2, 3].map((key) => ({
          key,
          height: 40,
          width: "70%",
          borderRadius: 12,
          alignSelf: key % 2 ? "flex-end" : "flex-start"
        }))
      );
      break;
    case "generic":
    default:
      body = /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("div", { className: "ir-sdk-shim", "aria-hidden": "true", style: { ...PLACEHOLDER, height: 16, width: "45%", borderRadius: 4 } }),
        rows([0, 1].map((key) => ({ key, height: 56, borderRadius: 8 })))
      ] });
  }
  return /* @__PURE__ */ jsx("div", { "aria-hidden": "true", style: wrap, children: body });
}
function useDelayedFlag(ms) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOn(true), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return on;
}
function Spinner({
  size = 18,
  thresholdMs = LOADING_TIMINGS.spinThresholdMs,
  label = "Loading"
}) {
  useLoadingStyles();
  const show = useDelayedFlag(thresholdMs);
  if (!show) return null;
  return /* @__PURE__ */ jsx(
    "span",
    {
      className: "ir-sdk-spin",
      role: "status",
      "aria-label": label,
      style: {
        display: "inline-block",
        width: size,
        height: size,
        border: "2px solid rgba(127,127,127,0.3)",
        borderTopColor: "currentColor",
        borderRadius: "50%",
        boxSizing: "border-box"
      }
    }
  );
}
function LoadingRegion({
  loading,
  fallback,
  label = "Loading",
  children
}) {
  useLoadingStyles();
  if (!loading) return /* @__PURE__ */ jsx(Fragment, { children });
  return /* @__PURE__ */ jsx(
    "div",
    {
      "aria-busy": "true",
      style: { display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", minHeight: 48 },
      children: fallback ?? /* @__PURE__ */ jsx(Spinner, { label })
    }
  );
}
export {
  LOADING_TIMINGS,
  LoadingRegion,
  Skeleton,
  SkeletonRow,
  Spinner
};
//# sourceMappingURL=loading.js.map