import "./chunk-VHAA22YE.js";
import { protocolStream } from "./protocolStream";
import { PROTOCOL_CONTRIBUTE } from "./generated/protocol";
function contribute(opts) {
  return protocolStream(PROTOCOL_CONTRIBUTE, "run", [opts]);
}
export {
  contribute
};
//# sourceMappingURL=contribute.js.map