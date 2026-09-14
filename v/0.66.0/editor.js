import "./chunk-VHAA22YE.js";
import { protocolRequest } from "./sandboxUtils";
import { SCHEMES } from "./protocolSchemes";
import { PROTOCOL_EDITOR } from "./generated/protocol";
const editorRequest = async (method, arg) => {
  const res = await protocolRequest(SCHEMES[PROTOCOL_EDITOR], method, [arg]);
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? `editor ${method} failed`);
    err.code = res?.code ?? "unknown";
    throw err;
  }
};
const openInEditor = (path, selection, opts) => editorRequest("open", {
  path,
  ...selection ? { selection } : {},
  ...opts?.reveal === true ? { reveal: true } : {}
});
const requestEdit = (target) => editorRequest("requestEdit", target ? { ...target } : {});
const setActiveFile = (path) => editorRequest("setActive", { path });
const closeFile = (path) => editorRequest("close", { path });
const createFile = (path) => editorRequest("createFile", { path });
const createFolder = (path) => editorRequest("createFolder", { path });
const deleteEntry = (path) => editorRequest("deleteEntry", { path });
const renameEntry = (from, to) => editorRequest("rename", { from, to });
const uploadFile = (path, bytes) => editorRequest("upload", { path, bytes });
export {
  closeFile,
  createFile,
  createFolder,
  deleteEntry,
  openInEditor,
  renameEntry,
  requestEdit,
  setActiveFile,
  uploadFile
};
//# sourceMappingURL=editor.js.map