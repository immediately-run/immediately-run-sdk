import "./chunk-VHAA22YE.js";
import { protocolRequest, sendMessage, addListener } from "./sandboxUtils";
import { consumeStream } from "./protocolStream";
import { createPushChannel } from "./pushChannel";
const split = (name) => {
  const i = name.indexOf(":");
  if (i <= 0) throw new Error(`invalid catalog method name: ${name}`);
  return [name.slice(0, i), name.slice(i + 1)];
};
const invoke = async (name, params = {}) => {
  const [scheme, method] = split(name);
  const res = await protocolRequest(scheme, method, [params]);
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? `${name} failed`);
    err.code = res?.code ?? "unknown";
    throw err;
  }
  return res.data;
};
const streamTransport = {
  send: (msg) => sendMessage(msg.type, msg),
  subscribe: (type, handler) => addListener(type, (msg) => handler(msg)),
  // Early-cancel: route a `{type, msgId, cancel:true}` frame back to the host so it
  // aborts the in-flight generation (and, for `llm:chat`, stops billing) — §3.3.
  cancel: (msg) => sendMessage(msg.type, msg)
};
function invokeStream(name, params = {}, signal) {
  const [scheme, method] = split(name);
  return consumeStream(streamTransport, `protocol-${scheme}`, method, [params], void 0, signal);
}
const channel = createPushChannel({
  pushType: "api-catalog",
  requestType: "request-api-catalog",
  initial: [],
  parse: (msg) => Array.isArray(msg.methods) ? msg.methods : void 0
});
const getCatalog = () => channel.get();
const onCatalogChange = (listener) => channel.onChange(listener);
const useCatalog = () => channel.use();
export {
  getCatalog,
  invoke,
  invokeStream,
  onCatalogChange,
  useCatalog
};
//# sourceMappingURL=catalog.js.map