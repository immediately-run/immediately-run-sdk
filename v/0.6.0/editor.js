import { protocolRequest } from "./sandboxUtils";
const editorRequest = async (method, arg) => {
  const res = await protocolRequest("editor", method, [arg]);
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? `editor ${method} failed`);
    err.code = res?.code ?? "unknown";
    throw err;
  }
};
const openInEditor = (path) => editorRequest("open", { path });
const createFile = (path) => editorRequest("createFile", { path });
const createFolder = (path) => editorRequest("createFolder", { path });
const deleteEntry = (path) => editorRequest("deleteEntry", { path });
const renameEntry = (from, to) => editorRequest("rename", { from, to });
const uploadFile = (path, bytes) => editorRequest("upload", { path, bytes });
export {
  createFile,
  createFolder,
  deleteEntry,
  openInEditor,
  renameEntry,
  uploadFile
};
//# sourceMappingURL=editor.js.map