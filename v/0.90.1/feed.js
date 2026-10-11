import "./chunk-VHAA22YE.js";
import { protocolRequest } from "./sandboxUtils.js";
import { throwOnRefusal } from "./protocolRefusal.js";
import { SCHEMES } from "./protocolSchemes.js";
import { PROTOCOL_FEED } from "./generated/protocol.js";
const feedFetch = async (instanceId, params = {}) => {
  const res = await protocolRequest(SCHEMES[PROTOCOL_FEED], "fetch", [{ instanceId, params }]);
  throwOnRefusal(res, "feedFetch failed");
  return res.data;
};
export {
  feedFetch
};
//# sourceMappingURL=feed.js.map