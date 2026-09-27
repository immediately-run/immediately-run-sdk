import "./chunk-VHAA22YE.js";
import { protocolRequest } from "./sandboxUtils.js";
import { SCHEMES } from "./protocolSchemes.js";
import { PROTOCOL_FEED } from "./generated/protocol.js";
const feedFetch = async (instanceId, params = {}) => {
  const res = await protocolRequest(SCHEMES[PROTOCOL_FEED], "fetch", [{ instanceId, params }]);
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? "feedFetch failed");
    err.code = (res && "code" in res ? res.code : void 0) ?? "unknown";
    throw err;
  }
  return res.data;
};
export {
  feedFetch
};
//# sourceMappingURL=feed.js.map