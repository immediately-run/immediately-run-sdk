import { sendMessage as defaultSend } from "./sandboxUtils";
const realNow = () => typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
const defaultDeps = { send: defaultSend, now: realNow };
let deps = defaultDeps;
let state = { reported: false };
const listeners = /* @__PURE__ */ new Set();
function reportReady() {
  if (state.reported) return;
  state = { reported: true, reportedAt: deps.now() };
  try {
    deps.send("ir-report-ready", { at: state.reportedAt });
  } catch {
  }
  for (const l of listeners) l(state);
}
function getReadyState() {
  return state;
}
function onReady(listener) {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}
function __setReadyDeps(d) {
  deps = { ...defaultDeps, ...d };
}
function __resetReady() {
  deps = defaultDeps;
  state = { reported: false };
  listeners.clear();
}
export {
  __resetReady,
  __setReadyDeps,
  getReadyState,
  onReady,
  reportReady
};
//# sourceMappingURL=ready.js.map