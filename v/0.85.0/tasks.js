import "./chunk-VHAA22YE.js";
import { useEffect, useState } from "react";
import { protocolRequest, sendMessage, addListener } from "./sandboxUtils.js";
import { transport } from "./hostTransport.js";
import { PROTOCOL_TASK, REQUEST_TASK_INPUT, TASK_CANCEL, TASK_COMPLETE, TASK_INPUT } from "./generated/protocol.js";
import { SCHEMES } from "./protocolSchemes.js";
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
const sameTaskInput = (a, b) => {
  if (a.task !== b.task) return false;
  try {
    return JSON.stringify(a.params) === JSON.stringify(b.params);
  } catch {
    return false;
  }
};
let inputPolled = false;
let inputPollFailureReported = false;
const ensureInputListener = () => {
  if (!inputListenerRegistered) {
    try {
      addListener(TASK_INPUT, (m) => {
        const next = { task: m.task, params: m.params ?? {} };
        if (latestInput && sameTaskInput(latestInput, next)) return;
        latestInput = next;
        inputListeners.forEach((l) => l(next));
      });
    } catch {
      return;
    }
    inputListenerRegistered = true;
  }
  if (inputPolled) return;
  try {
    sendMessage(REQUEST_TASK_INPUT);
    inputPolled = true;
  } catch (err) {
    if (!inputPollFailureReported) {
      inputPollFailureReported = true;
      console.warn("[immediately.run] the task-input poll could not be sent; it is retried on the next read.", err);
    }
  }
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