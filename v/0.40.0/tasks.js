import "./chunk-VHAA22YE.js";
import { useEffect, useState } from "react";
import { protocolRequest, sendMessage, addListener } from "./sandboxUtils";
const capFile = (ref, opts) => ({ $cap: "file", mountId: ref.mountId, relPath: ref.relPath, mode: opts.mode });
const capDir = (ref, opts) => ({ $cap: "dir", mountId: ref.mountId, relPath: ref.relPath, mode: opts.mode });
const invokeTask = async (task, params = {}) => {
  const res = await protocolRequest("task", "invoke", [{ task, params }]);
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? `task '${task}' failed`);
    err.code = res?.code ?? "unknown";
    throw err;
  }
  return res.data;
};
let latestInput = null;
const inputListeners = /* @__PURE__ */ new Set();
addListener("task-input", (m) => {
  latestInput = { task: m.task, params: m.params ?? {} };
  inputListeners.forEach((l) => l(latestInput));
});
const getTaskInput = () => latestInput;
const completeTask = (result) => sendMessage("task-complete", { result });
const cancelTask = () => sendMessage("task-cancel", {});
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
  completeTask,
  getTaskInput,
  invokeTask,
  useTaskInput
};
//# sourceMappingURL=tasks.js.map