import { protocolRequest } from "./sandboxUtils";
const openInEditor = async (path) => {
  const res = await protocolRequest("editor", "open", [{ path }]);
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? "open failed");
    err.code = res?.code ?? "unknown";
    throw err;
  }
};
export {
  openInEditor
};
//# sourceMappingURL=editor.js.map