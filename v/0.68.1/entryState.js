import "./chunk-VHAA22YE.js";
const ENTRY_STATE_MAX_BYTES = 4096;
const collectors = /* @__PURE__ */ new Map();
let queued = {};
let arrived = { state: void 0, direction: "push" };
const listeners = /* @__PURE__ */ new Set();
const notify = () => {
  for (const l of [...listeners]) l();
};
const saveEntryState = (key, value) => {
  queued[key] = value;
};
const registerEntryStateCollector = (key, collect) => {
  collectors.set(key, collect);
  return () => {
    if (collectors.get(key) === collect) collectors.delete(key);
  };
};
const takeQueuedEntryState = () => {
  const out = { ...queued };
  queued = {};
  for (const [key, collect] of collectors) {
    try {
      const value = collect();
      if (value !== void 0) out[key] = value;
    } catch {
    }
  }
  if (Object.keys(out).length === 0) return void 0;
  let size = 0;
  try {
    size = JSON.stringify(out).length;
  } catch {
    return void 0;
  }
  if (size > ENTRY_STATE_MAX_BYTES) {
    console.warn(
      `[Sandbox] entry state is ${size} bytes, over the ${ENTRY_STATE_MAX_BYTES}-byte cap \u2014 dropped. Keep per-entry scratch small (a scroll offset, a few ids), not a cache.`
    );
    return void 0;
  }
  return out;
};
const receiveNavigation = (next) => {
  arrived = next;
  notify();
};
const getArrivedNavigation = () => arrived;
const subscribeNavigation = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const resetEntryState = () => {
  collectors.clear();
  queued = {};
  arrived = { state: void 0, direction: "push" };
  listeners.clear();
};
export {
  ENTRY_STATE_MAX_BYTES,
  getArrivedNavigation,
  receiveNavigation,
  registerEntryStateCollector,
  resetEntryState,
  saveEntryState,
  subscribeNavigation,
  takeQueuedEntryState
};
//# sourceMappingURL=entryState.js.map