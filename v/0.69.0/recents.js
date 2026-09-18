import "./chunk-VHAA22YE.js";
import { protocolRequest } from "./sandboxUtils.js";
import { PROTOCOL_RECENTS } from "./generated/protocol.js";
import { SCHEMES } from "./protocolSchemes.js";
const recentsRequest = async (params) => {
  const res = await protocolRequest(SCHEMES[PROTOCOL_RECENTS], "list", [params]);
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? "recents request failed");
    err.code = res?.code ?? "unknown";
    throw err;
  }
  return res.data;
};
async function listRecentProjects() {
  const res = await recentsRequest({});
  return res.projects ?? null;
}
async function clearRecentProjects() {
  await recentsRequest({ clear: true });
}
export {
  clearRecentProjects,
  listRecentProjects
};
//# sourceMappingURL=recents.js.map