import "./chunk-VHAA22YE.js";
import { sendMessage, addListener } from "./sandboxUtils.js";
import { SDK_VERSION } from "./version.js";
import { REQUEST_HANDSHAKE, SDK_HANDSHAKE } from "./generated/protocol.js";
import { getHostRuntime } from "./hostRuntime.js";
const SDK_PROTOCOL_VERSION = "1.0.0";
const sdkHandshake = () => ({
  sdkVersion: SDK_VERSION,
  protocolVersion: SDK_PROTOCOL_VERSION
});
function announceHandshake() {
  const send = () => {
    try {
      const payload = sdkHandshake();
      sendMessage(SDK_HANDSHAKE, payload);
    } catch {
    }
  };
  send();
  return addListener(REQUEST_HANDSHAKE, send);
}
export {
  SDK_PROTOCOL_VERSION,
  SDK_VERSION,
  announceHandshake,
  getHostRuntime,
  sdkHandshake
};
//# sourceMappingURL=runtime.js.map