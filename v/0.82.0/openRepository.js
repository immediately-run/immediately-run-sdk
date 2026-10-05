import "./chunk-VHAA22YE.js";
import { protocolRequest } from "./sandboxUtils.js";
import { throwOnRefusal } from "./protocolRefusal.js";
import { PROTOCOL_OPENREPO } from "./generated/protocol.js";
import { SCHEMES } from "./protocolSchemes.js";
async function openRepository(coordinates) {
  const { provider, namespace, repository } = coordinates;
  const res = await protocolRequest(SCHEMES[PROTOCOL_OPENREPO], "open", [
    { provider, namespace, repository }
  ]);
  throwOnRefusal(res, "repository open refused");
}
export {
  openRepository
};
//# sourceMappingURL=openRepository.js.map