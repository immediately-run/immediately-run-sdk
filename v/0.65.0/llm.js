import "./chunk-VHAA22YE.js";
import { invokeStream } from "./catalog";
import { createPushChannel } from "./pushChannel";
import { LLM_PROVIDER, REQUEST_LLM_PROVIDER } from "./generated/protocol";
function chat(req) {
  const { signal, ...params } = req;
  return invokeStream("llm:chat", params, signal);
}
const EXECUTORS = ["browser-direct", "backend-proxied"];
const usableModels = (raw) => {
  if (!raw || typeof raw !== "object") return void 0;
  const { fast, smart } = raw;
  return typeof fast === "string" && fast && typeof smart === "string" && smart ? { fast, smart } : void 0;
};
function normalizeProviderInfo(provider) {
  if (!provider) return null;
  const { displayName: rawName, executor: rawExecutor, models: rawModels, ...rest } = provider;
  const wire = provider.features;
  const executor = EXECUTORS.includes(rawExecutor) ? rawExecutor : void 0;
  const displayName = typeof rawName === "string" && rawName ? rawName : void 0;
  const models = usableModels(rawModels);
  return {
    ...rest,
    features: { ...wire, reasoning: wire.reasoning === true },
    ...displayName ? { displayName } : {},
    ...executor ? { executor } : {},
    ...models ? { models } : {}
  };
}
let answered = false;
const channel = createPushChannel({
  pushType: LLM_PROVIDER,
  requestType: REQUEST_LLM_PROVIDER,
  initial: null,
  parse: (msg) => {
    if (!("provider" in msg)) return void 0;
    answered = true;
    return normalizeProviderInfo(msg.provider ?? null);
  }
});
const stateOf = (provider) => !answered ? { status: "unknown" } : provider ? { status: "configured", provider } : { status: "not-configured" };
const describeChat = () => channel.get();
const describeChatState = () => stateOf(channel.get());
const onChatProviderChange = (listener) => channel.onChange(listener);
const onChatProviderStateChange = (listener) => channel.onChange((p) => listener(stateOf(p)));
const useChatProvider = () => channel.use();
const useChatProviderState = () => stateOf(channel.use());
export {
  chat,
  describeChat,
  describeChatState,
  normalizeProviderInfo,
  onChatProviderChange,
  onChatProviderStateChange,
  useChatProvider,
  useChatProviderState
};
//# sourceMappingURL=llm.js.map