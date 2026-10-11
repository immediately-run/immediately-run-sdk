import "./chunk-VHAA22YE.js";
import { protocolRequest } from "./sandboxUtils.js";
import { throwOnRefusal } from "./protocolRefusal.js";
import { PROTOCOL_OPENREPO } from "./generated/protocol.js";
import { SCHEMES } from "./protocolSchemes.js";
async function openRepository(coordinates, reveal) {
  const { provider, namespace, repository } = coordinates;
  const params = { provider, namespace, repository };
  if (reveal !== void 0) params.reveal = reveal;
  const res = await protocolRequest(SCHEMES[PROTOCOL_OPENREPO], "open", [params]);
  throwOnRefusal(res, "repository open refused");
}
export {
  openRepository
};
//# sourceMappingURL=openRepository.js.map