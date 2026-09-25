import "./chunk-VHAA22YE.js";
import { invokeStream } from "./catalog.js";
import { createPushChannel } from "./pushChannel.js";
import { LLM_PROVIDER, REQUEST_LLM_PROVIDER } from "./generated/protocol.js";
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
const usableConnectedProviders = (raw) => {
  if (!Array.isArray(raw)) return void 0;
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { providerId, displayName, models } = item;
    if (typeof providerId !== "string" || !providerId) continue;
    if (typeof displayName !== "string" || !displayName) continue;
    const cleanModels = Array.isArray(models) ? models.filter((m) => typeof m === "string" && !!m) : [];
    out.push({ providerId, displayName, models: cleanModels });
  }
  return out.length > 0 ? out : void 0;
};
function normalizeProviderInfo(provider) {
  if (!provider) return null;
  const {
    displayName: rawName,
    executor: rawExecutor,
    models: rawModels,
    connectedProviders: rawConnected,
    ...rest
  } = provider;
  const wire = provider.features;
  const executor = EXECUTORS.includes(rawExecutor) ? rawExecutor : void 0;
  const displayName = typeof rawName === "string" && rawName ? rawName : void 0;
  const models = usableModels(rawModels);
  const connectedProviders = usableConnectedProviders(rawConnected);
  return {
    ...rest,
    features: { ...wire, reasoning: wire.reasoning === true },
    ...displayName ? { displayName } : {},
    ...executor ? { executor } : {},
    ...models ? { models } : {},
    ...connectedProviders ? { connectedProviders } : {}
  };
}
let answered = false;
let ungrantedMark = false;
const channel = createPushChannel({
  pushType: LLM_PROVIDER,
  requestType: REQUEST_LLM_PROVIDER,
  initial: null,
  parse: (msg) => {
    if (!("provider" in msg)) return void 0;
    answered = true;
    ungrantedMark = msg.ungranted === true;
    return normalizeProviderInfo(msg.provider ?? null);
  }
});
function deriveChatProviderState(answered2, ungranted, provider) {
  if (!answered2) return { status: "unknown" };
  if (ungranted) return { status: "ungranted" };
  return provider ? { status: "configured", provider } : { status: "not-configured" };
}
const stateOf = (provider) => deriveChatProviderState(answered, ungrantedMark, provider);
const describeChat = () => channel.get();
const describeChatState = () => stateOf(channel.get());
const onChatProviderChange = (listener) => channel.onChange(listener);
const onChatProviderStateChange = (listener) => channel.onChange((p) => listener(stateOf(p)));
const useChatProvider = () => channel.use();
const useChatProviderState = () => stateOf(channel.use());
export {
  chat,
  deriveChatProviderState,
  describeChat,
  describeChatState,
  normalizeProviderInfo,
  onChatProviderChange,
  onChatProviderStateChange,
  useChatProvider,
  useChatProviderState
};
//# sourceMappingURL=llm.js.map