import { createPushChannel } from "./pushChannel";
const isStringArray = (v) => Array.isArray(v) && v.every((p) => typeof p === "string");
const channel = createPushChannel({
  pushType: "editor-context",
  requestType: "request-editor-context",
  initial: { dirtyPaths: [], openFiles: [] },
  parse: (msg) => isStringArray(msg.dirtyPaths) ? {
    dirtyPaths: msg.dirtyPaths,
    // `openFiles` is newer than `dirtyPaths`; tolerate an older host that
    // omits it (defensive SDK — defaults to empty rather than rejecting).
    openFiles: isStringArray(msg.openFiles) ? msg.openFiles : []
  } : void 0
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