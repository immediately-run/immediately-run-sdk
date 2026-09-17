import "./chunk-VHAA22YE.js";
import { protocolRequest } from "./sandboxUtils.js";
import { PROTOCOL_OPENLINK } from "./generated/protocol.js";
import { SCHEMES } from "./protocolSchemes.js";
async function openExternal(url) {
  const res = await protocolRequest(SCHEMES[PROTOCOL_OPENLINK], "open", [{ url }]);
  if (!res || res.ok !== true) {
    const err = new Error(
      (res && "message" in res ? res.message : void 0) ?? "external link open refused"
    );
    err.code = (res && "code" in res ? res.code : void 0) ?? "unknown";
    throw err;
  }
}
export {
  openExternal
};
//# sourceMappingURL=openExternal.js.map