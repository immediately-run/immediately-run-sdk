import "./chunk-VHAA22YE.js";
import { protocolRequest } from "./sandboxUtils.js";
import { throwOnRefusal } from "./protocolRefusal.js";
import { PROTOCOL_RECENTS } from "./generated/protocol.js";
import { SCHEMES } from "./protocolSchemes.js";
const recentsRequest = async (params) => {
  const res = await protocolRequest(SCHEMES[PROTOCOL_RECENTS], "list", [params]);
  throwOnRefusal(res, "recents request failed");
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