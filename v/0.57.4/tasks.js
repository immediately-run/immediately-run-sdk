import "./chunk-VHAA22YE.js";
import { useEffect, useState } from "react";
import { protocolRequest, sendMessage, addListener } from "./sandboxUtils";
import { transport } from "./hostTransport";
import { PROTOCOL_TASK, TASK_CANCEL, TASK_COMPLETE, TASK_INPUT } from "./generated/protocol";
import { SCHEMES } from "./protocolSchemes";
const capFile = (ref, opts) => ({
  $cap: "file",
  mountId: ref.mountId,
  relPath: ref.relPath,
  mode: opts.mode
});
const capDir = (ref, opts) => ({
  $cap: "dir",
  mountId: ref.mountId,
  relPath: ref.relPath,
  mode: opts.mode
});
const invokeTask = async (task, params = {}) => {
  const res = await protocolRequest(SCHEMES[PROTOCOL_TASK], "invoke", [{ task, params }]);
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? `task '${task}' failed`);
    err.code = res?.code ?? "unknown";
    throw err;
  }
  return res.data;
};
const capturePhoto = (options = {}) => invokeTask("capture-photo", { ...options });
const captureAudio = (options = {}) => invokeTask("capture-audio", { ...options });
let latestInput = null;
const inputListeners = /* @__PURE__ */ new Set();
let inputListenerRegistered = false;
const ensureInputListener = () => {
  if (inputListenerRegistered) return;
  try {
    addListener(TASK_INPUT, (m) => {
      latestInput = { task: m.task, params: m.params ?? {} };
      inputListeners.forEach((l) => l(latestInput));
    });
  } catch {
    return;
  }
  inputListenerRegistered = true;
};
ensureInputListener();
const getTaskInput = () => {
  ensureInputListener();
  return latestInput;
};
const hostReachable = () => {
  try {
    transport();
    return true;
  } catch {
    return false;
  }
};
const completeTask = (result) => {
  if (!hostReachable()) return;
  sendMessage(TASK_COMPLETE, { result });
};
const cancelTask = () => {
  if (!hostReachable()) return;
  sendMessage(TASK_CANCEL, {});
};
const useTaskInput = () => {
  const [input, setInput] = useState(getTaskInput);
  useEffect(() => {
    const l = (i) => setInput(i);
    inputListeners.add(l);
    if (latestInput) setInput(latestInput);
    return () => {
      inputListeners.delete(l);
    };
  }, []);
  return input;
};
export {
  cancelTask,
  capDir,
  capFile,
  captureAudio,
  capturePhoto,
  completeTask,
  getTaskInput,
  invokeTask,
  useTaskInput
};
//# sourceMappingURL=tasks.js.map