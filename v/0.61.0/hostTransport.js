import "./chunk-VHAA22YE.js";
import { getHostRuntime } from "./hostRuntime";
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
  sendMessage,
  transport
};
//# sourceMappingURL=hostTransport.js.map