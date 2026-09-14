import "./chunk-VHAA22YE.js";
import { createPushChannel } from "./pushChannel";
import { EDITOR_CONTEXT, REQUEST_EDITOR_CONTEXT } from "./generated/protocol";
const isStringArray = (v) => Array.isArray(v) && v.every((p) => typeof p === "string");
const channel = createPushChannel({
  pushType: EDITOR_CONTEXT,
  requestType: REQUEST_EDITOR_CONTEXT,
  initial: { dirtyPaths: [], openFiles: [], activeFile: null, viewedFile: null },
  parse: (msg) => isStringArray(msg.dirtyPaths) ? {
    dirtyPaths: msg.dirtyPaths,
    // `openFiles` is newer than `dirtyPaths`; tolerate an older host that
    // omits it (defensive SDK — defaults to empty rather than rejecting).
    openFiles: isStringArray(msg.openFiles) ? msg.openFiles : [],
    // `activeFile` is newer still; an older host that omits it (or sends a
    // non-string) reads as `null` — no file highlighted, never a throw.
    activeFile: typeof msg.activeFile === "string" ? msg.activeFile : null,
    // `viewedFile` is the newest (R3-268); same tolerance — an older host
    // that omits it reads as `null` (no stage highlight), never a throw.
    viewedFile: typeof msg.viewedFile === "string" ? msg.viewedFile : null
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