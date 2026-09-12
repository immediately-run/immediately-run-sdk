import "./chunk-VHAA22YE.js";
import { createPushChannel } from "./pushChannel";
import { FS_CHANGE } from "./generated/protocol";
const isStringArray = (v) => Array.isArray(v) && v.every((p) => typeof p === "string");
const isMountBatch = (v) => {
  if (typeof v !== "object" || v === null) return false;
  const m = v;
  if (typeof m.path !== "string" || !Array.isArray(m.changes)) return false;
  return m.changes.every(
    (c) => typeof c === "object" && c !== null && typeof c.path === "string" && ["add", "change", "remove"].includes(c.kind)
  );
};
const channel = createPushChannel({
  pushType: FS_CHANGE,
  initial: { paths: [], epoch: 0 },
  parse: (msg) => isStringArray(msg.paths) && typeof msg.epoch === "number" ? {
    paths: msg.paths,
    epoch: msg.epoch,
    ...isMountBatch(msg.mount) ? { mount: msg.mount } : {}
  } : void 0
});
const getFsChange = () => channel.get();
const onFsChange = (listener) => channel.onChange(listener);
const useFsChange = () => channel.use();
export {
  getFsChange,
  onFsChange,
  useFsChange
};
//# sourceMappingURL=onFsChange.js.map