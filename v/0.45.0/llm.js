import "./chunk-VHAA22YE.js";
import { invokeStream } from "./catalog";
import { createPushChannel } from "./pushChannel";
import { LLM_PROVIDER, REQUEST_LLM_PROVIDER } from "./generated/protocol";
function chat(req) {
  const { signal, ...params } = req;
  return invokeStream(
    "llm:chat",
    params,
    signal
  );
}
const channel = createPushChannel({
  pushType: LLM_PROVIDER,
  requestType: REQUEST_LLM_PROVIDER,
  initial: null,
  parse: (msg) => "provider" in msg ? msg.provider : void 0
});
const describeChat = () => channel.get();
const onChatProviderChange = (listener) => channel.onChange(listener);
const useChatProvider = () => channel.use();
export {
  chat,
  describeChat,
  onChatProviderChange,
  useChatProvider
};
//# sourceMappingURL=llm.js.map