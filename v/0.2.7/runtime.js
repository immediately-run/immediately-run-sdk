import { sendMessage, addListener } from "./sandboxUtils";
const SDK_PROTOCOL_VERSION = "1.0.0";
const SDK_VERSION = "0.2.7";
function getHostRuntime() {
  try {
    return globalThis.__immediatelyRun__ ?? null;
  } catch {
    return null;
  }
}
const sdkHandshake = () => ({
  sdkVersion: SDK_VERSION,
  protocolVersion: SDK_PROTOCOL_VERSION
});
function announceHandshake() {
  const send = () => {
    try {
      sendMessage("sdk-handshake", sdkHandshake());
    } catch {
    }
  };
  send();
  return addListener("request-handshake", send);
}
export {
  SDK_PROTOCOL_VERSION,
  SDK_VERSION,
  announceHandshake,
  getHostRuntime,
  sdkHandshake
};
//# sourceMappingURL=runtime.js.map