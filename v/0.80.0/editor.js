import "./chunk-VHAA22YE.js";
import { protocolRequest } from "./sandboxUtils.js";
import { throwOnRefusal } from "./protocolRefusal.js";
import { SCHEMES } from "./protocolSchemes.js";
import { PROTOCOL_EDITOR } from "./generated/protocol.js";
const editorRequest = async (method, arg) => {
  const res = await protocolRequest(SCHEMES[PROTOCOL_EDITOR], method, [arg]);
  throwOnRefusal(res, `editor ${method} failed`);
};
const openInEditor = (path, selection, opts) => editorRequest("open", {
  path,
  ...selection ? { selection } : {},
  ...opts?.reveal === true ? { reveal: true } : {}
});
const requestEdit = (target) => {
  const classes = [target?.path, target?.file, target?.bundleFile].filter((t) => t !== void 0).length;
  if (classes > 1) {
    const err = new Error("requestEdit: give at most one of `path`, `file` or `bundleFile`");
    err.code = "invalid-params";
    return Promise.reject(err);
  }
  return editorRequest("requestEdit", target ? { ...target } : {});
};
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