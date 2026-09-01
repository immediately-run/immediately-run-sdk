import "./chunk-VHAA22YE.js";
import { protocolRequest } from "./sandboxUtils";
import { PROTOCOL_RECENTS } from "./generated/protocol";
import { SCHEMES } from "./protocolSchemes";
const recentsRequest = (params) => protocolRequest(SCHEMES[PROTOCOL_RECENTS], "list", [params]);
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