import "./chunk-VHAA22YE.js";
import { protocolRequest } from "./sandboxUtils.js";
import { throwOnRefusal } from "./protocolRefusal.js";
import { PROTOCOL_OPENBUNDLE } from "./generated/protocol.js";
import { SCHEMES } from "./protocolSchemes.js";
const OPEN_BUNDLE_REPLY_TIMEOUT_MS = 2e3;
async function openBundle(target) {
  const { $cap, mountId, relPath, mode } = target?.dir ?? {};
  const params = { dir: { $cap, mountId, relPath, mode } };
  if (target?.view !== void 0) params.view = target.view;
  const res = await protocolRequest(SCHEMES[PROTOCOL_OPENBUNDLE], "open", [params], {
    timeoutMs: OPEN_BUNDLE_REPLY_TIMEOUT_MS
  });
  throwOnRefusal(res, "bundle open refused");
}
export {
  OPEN_BUNDLE_REPLY_TIMEOUT_MS,
  openBundle
};
//# sourceMappingURL=openBundle.js.map