import "./chunk-VHAA22YE.js";
import { protocolRequest } from "./sandboxUtils.js";
import { throwOnRefusal } from "./protocolRefusal.js";
import { PROTOCOL_OPENLINK } from "./generated/protocol.js";
import { SCHEMES } from "./protocolSchemes.js";
async function openExternal(url) {
  const res = await protocolRequest(SCHEMES[PROTOCOL_OPENLINK], "open", [{ url }]);
  throwOnRefusal(res, "external link open refused");
}
export {
  openExternal
};
//# sourceMappingURL=openExternal.js.map