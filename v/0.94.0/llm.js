import "./chunk-VHAA22YE.js";
import { invoke, invokeStream } from "./catalog.js";
import { createPushChannel } from "./pushChannel.js";
import { LLM_PROVIDER, REQUEST_LLM_PROVIDER } from "./generated/protocol.js";
function chat(req) {
  const { signal, ...params } = req;
  return invokeStream("llm:chat", params, signal);
}
function embed(req) {
  return invoke("llm:embed", req);
}
const EXECUTORS = ["browser-direct", "backend-proxied"];
const usableModels = (raw) => {
  if (!raw || typeof raw !== "object") return void 0;
  const { fast, smart } = raw;
  return typeof fast === "string" && fast && typeof smart === "string" && smart ? { fast, smart } : void 0;
};
const withReasoningClosed = (f) => ({ ...f, reasoning: f.reasoning === true });
const positiveInt = (v) => typeof v === "number" && Number.isInteger(v) && v > 0;
const tokenCount = (v) => typeof v === "number" && Number.isInteger(v) && v >= 0;
const usableFeatures = (raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return void 0;
  const f = raw;
  if (typeof f.vision !== "boolean" || typeof f.tools !== "boolean" || typeof f.jsonMode !== "boolean" || !tokenCount(f.maxContextTokens))
    return void 0;
  const { vision, tools, jsonMode, maxContextTokens } = f;
  return withReasoningClosed({ vision, tools, jsonMode, reasoning: f.reasoning, maxContextTokens });
};
const MODEL_KINDS = {
  chat: true,
  embedding: true,
  image: true,
  speech: true,
  transcription: true,
  video: true,
  reranking: true
};
const usableModelsByKind = (raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return void 0;
  const out = {};
  for (const [kind, list] of Object.entries(raw)) {
    if (!Object.prototype.hasOwnProperty.call(MODEL_KINDS, kind) || !Array.isArray(list)) continue;
    const models = [];
    for (const m of list) {
      if (!m || typeof m !== "object" || Array.isArray(m)) continue;
      const { id, name, dimensions, maxInputs } = m;
      if (typeof id !== "string" || !id || typeof name !== "string" || !name) continue;
      models.push({
        id,
        name,
        ...positiveInt(dimensions) ? { dimensions } : {},
        ...positiveInt(maxInputs) ? { maxInputs } : {}
      });
    }
    if (models.length > 0) out[kind] = models;
  }
  return Object.keys(out).length > 0 ? out : void 0;
};
const nonEmptyString = (v) => typeof v === "string" && v.length > 0;
const stringList = (v) => Array.isArray(v) && v.every(nonEmptyString) ? [...v] : void 0;
const nonNegativeNumber = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;
const usableThinking = (raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return void 0;
  const { levels: rawLevels, default: rawDefault } = raw;
  const levels = stringList(rawLevels);
  if (!levels || typeof rawDefault !== "string") return void 0;
  if (levels.length > 0 && !levels.includes(rawDefault)) return void 0;
  return { levels, default: rawDefault };
};
const usablePricing = (raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return void 0;
  const { inputPerMTok, outputPerMTok, unit } = raw;
  return nonNegativeNumber(inputPerMTok) && nonNegativeNumber(outputPerMTok) && nonEmptyString(unit) ? { inputPerMTok, outputPerMTok, unit } : void 0;
};
const usableModelInfo = (raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return void 0;
  const m = raw;
  const { id, name, contextTokens, outputTokens } = m;
  if (!nonEmptyString(id) || !nonEmptyString(name)) return void 0;
  if (!positiveInt(contextTokens) || !positiveInt(outputTokens)) return void 0;
  const features = usableFeatures(m.features);
  const thinking = usableThinking(m.thinking);
  const inputModalities = stringList(m.inputModalities);
  const outputModalities = stringList(m.outputModalities);
  if (!features || !thinking || !inputModalities || !outputModalities) return void 0;
  const pricing = usablePricing(m.pricing);
  return {
    id,
    name,
    features,
    contextTokens,
    outputTokens,
    inputModalities,
    outputModalities,
    thinking,
    ...pricing ? { pricing } : {}
  };
};
const partitionModels = (raw) => {
  const ids = [];
  const infos = [];
  if (!Array.isArray(raw)) return { ids, infos };
  for (const entry of raw) {
    if (nonEmptyString(entry)) {
      ids.push(entry);
    } else if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const info = usableModelInfo(entry);
      if (info && !infos.some((i) => i.id === info.id)) infos.push(info);
      const id = entry.id;
      if (nonEmptyString(id)) ids.push(id);
    }
  }
  return { ids: [...new Set(ids)], infos };
};
const usableConnectedProviders = (raw) => {
  if (!Array.isArray(raw)) return void 0;
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { providerId, displayName, models } = item;
    if (typeof providerId !== "string" || !providerId) continue;
    if (typeof displayName !== "string" || !displayName) continue;
    const { ids, infos } = partitionModels(models);
    const wireIds = item.modelIds;
    const wireIdList = Array.isArray(wireIds) ? [...new Set(wireIds.filter(nonEmptyString))] : [];
    const modelIds = wireIdList.length > 0 ? wireIdList : ids;
    const described = wireIdList.length > 0 ? infos.filter((i) => wireIdList.includes(i.id)) : infos;
    const features = usableFeatures(item.features);
    const modelsByKind = usableModelsByKind(item.modelsByKind);
    out.push({
      providerId,
      displayName,
      models: modelIds,
      ...described.length > 0 ? { modelInfo: described } : {},
      ...features ? { features } : {},
      ...modelsByKind ? { modelsByKind } : {}
    });
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
    features: withReasoningClosed(wire),
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
  embed,
  normalizeProviderInfo,
  onChatProviderChange,
  onChatProviderStateChange,
  useChatProvider,
  useChatProviderState
};
//# sourceMappingURL=llm.js.map