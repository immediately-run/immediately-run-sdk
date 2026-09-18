import "./chunk-VHAA22YE.js";
import { protocolRequest } from "./sandboxUtils.js";
import { PROTOCOL_OPENREPO } from "./generated/protocol.js";
import { SCHEMES } from "./protocolSchemes.js";
async function openRepository(coordinates) {
  const { provider, namespace, repository } = coordinates;
  const res = await protocolRequest(SCHEMES[PROTOCOL_OPENREPO], "open", [
    { provider, namespace, repository }
  ]);
  if (!res || res.ok !== true) {
    const err = new Error(
      (res && "message" in res ? res.message : void 0) ?? "repository open refused"
    );
    err.code = (res && "code" in res ? res.code : void 0) ?? "unknown";
    throw err;
  }
}
export {
  openRepository
};
//# sourceMappingURL=openRepository.js.map