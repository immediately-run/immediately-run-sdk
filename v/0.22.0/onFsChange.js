import { createPushChannel } from "./pushChannel";
const isStringArray = (v) => Array.isArray(v) && v.every((p) => typeof p === "string");
const channel = createPushChannel({
  pushType: "fs-change",
  initial: { paths: [], epoch: 0 },
  parse: (msg) => isStringArray(msg.paths) && typeof msg.epoch === "number" ? { paths: msg.paths, epoch: msg.epoch } : void 0
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