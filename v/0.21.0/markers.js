import { sendMessage as defaultSend } from "./sandboxUtils";
import { isIrMarkerName } from "./irMarkers";
const realNow = () => typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
const defaultDeps = { send: defaultSend, now: realNow };
let deps = defaultDeps;
const emitted = /* @__PURE__ */ new Set();
function emitMarker(name, attrs) {
  if (!isIrMarkerName(name)) return;
  try {
    deps.send("ir-marker", { name, at: deps.now(), ...attrs !== void 0 ? { attrs } : {} });
  } catch {
  }
}
function emitMarkerOnce(name, attrs) {
  if (emitted.has(name)) return;
  emitted.add(name);
  emitMarker(name, attrs);
}
function __setMarkerDeps(d) {
  deps = { ...defaultDeps, ...d };
}
function __resetMarkers() {
  deps = defaultDeps;
  emitted.clear();
}
export {
  __resetMarkers,
  __setMarkerDeps,
  emitMarker,
  emitMarkerOnce
};
//# sourceMappingURL=markers.js.map