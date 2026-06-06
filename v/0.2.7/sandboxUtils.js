import { getHostRuntime } from "./runtime";
function transport() {
  try {
    const injected = module?.evaluation?.module?.bundler?.messageBus;
    if (injected && typeof injected.sendMessage === "function") return injected;
  } catch {
  }
  const t = getHostRuntime()?.transport;
  if (t && typeof t.sendMessage === "function") return t;
  throw new Error("immediately.run: no host transport (neither injected nor __immediatelyRun__)");
}
const sendMessage = (type, data = {}) => {
  transport().sendMessage(type, data);
};
const protocolRequest = (protocolName, method, params) => transport().protocolRequest(protocolName, method, params);
const addListener = (msgType, handler, event) => {
  const onMessage = event ?? transport().onMessage;
  const disposable = onMessage((msg) => {
    if (msg.type === msgType) {
      handler(msg);
    }
  });
  return () => disposable.dispose();
};
export {
  addListener,
  protocolRequest,
  sendMessage
};
//# sourceMappingURL=sandboxUtils.js.map