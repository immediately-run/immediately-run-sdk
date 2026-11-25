import "./chunk-VHAA22YE.js";
import { jsx } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { LOADING_TIMINGS } from "./loading.js";
function Status({ children, assertive = false, className, style }) {
  return /* @__PURE__ */ jsx("div", { role: "status", "aria-live": assertive ? "assertive" : "polite", className, style, children });
}
function Busy({ label, floorMs = LOADING_TIMINGS.spinThresholdMs, className, style }) {
  const [show, setShow] = useState(floorMs <= 0);
  useEffect(() => {
    if (floorMs <= 0) {
      setShow(true);
      return;
    }
    const t = setTimeout(() => setShow(true), floorMs);
    return () => clearTimeout(t);
  }, [floorMs, label]);
  return /* @__PURE__ */ jsx("span", { "aria-busy": "true", className, style, children: show ? label : "" });
}
export {
  Busy,
  Status
};
//# sourceMappingURL=status.js.map