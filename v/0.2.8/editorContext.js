import { createPushChannel } from "./pushChannel";
const channel = createPushChannel({
  pushType: "editor-context",
  requestType: "request-editor-context",
  initial: { dirtyPaths: [] },
  parse: (msg) => Array.isArray(msg.dirtyPaths) && msg.dirtyPaths.every((p) => typeof p === "string") ? { dirtyPaths: msg.dirtyPaths } : void 0
});
const getEditorContext = () => channel.get();
const onEditorContextChange = (listener) => channel.onChange(listener);
const useEditorContext = () => channel.use();
export {
  getEditorContext,
  onEditorContextChange,
  useEditorContext
};
//# sourceMappingURL=editorContext.js.map