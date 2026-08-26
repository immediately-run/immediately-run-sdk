import "./chunk-VHAA22YE.js";
import { useEffect, useState } from "react";
import { protocolRequest, sendMessage, addListener } from "./sandboxUtils";
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
let latestInput = null;
const inputListeners = /* @__PURE__ */ new Set();
addListener(TASK_INPUT, (m) => {
  latestInput = { task: m.task, params: m.params ?? {} };
  inputListeners.forEach((l) => l(latestInput));
});
const getTaskInput = () => latestInput;
const completeTask = (result) => sendMessage(TASK_COMPLETE, { result });
const cancelTask = () => sendMessage(TASK_CANCEL, {});
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