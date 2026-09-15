import "./chunk-VHAA22YE.js";
import { protocolRequest } from "./sandboxUtils";
import { protocolStream } from "./protocolStream";
import { SCHEMES } from "./protocolSchemes";
import { PROTOCOL_FETCH } from "./generated/protocol";
const hostFetch = async (url, init = {}) => {
  const res = await protocolRequest(SCHEMES[PROTOCOL_FETCH], "fetch", [
    { url, method: init.method, headers: init.headers, body: init.body }
  ]);
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? "hostFetch failed");
    err.code = (res && "code" in res ? res.code : void 0) ?? "unknown";
    throw err;
  }
  return res.data;
};
function hostFetchStream(url, init = {}) {
  return protocolStream(PROTOCOL_FETCH, "fetchStream", [
    { url, method: init.method, headers: init.headers, body: init.body }
  ]);
}
export {
  hostFetch,
  hostFetchStream
};
//# sourceMappingURL=netFetch.js.map