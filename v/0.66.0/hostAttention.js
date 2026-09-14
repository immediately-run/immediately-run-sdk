import "./chunk-VHAA22YE.js";
import { createPushChannel } from "./pushChannel";
import { HOST_ATTENTION, REQUEST_HOST_ATTENTION } from "./generated/protocol";
const NO_HOST_ATTENTION = { awaiting: false, kind: null, since: null };
const KINDS = /* @__PURE__ */ new Set(["passkey", "consent", "picker", "confirmation"]);
const parseHostAttention = (value) => {
  const a = value;
  if (!a || typeof a !== "object" || typeof a.awaiting !== "boolean") return void 0;
  if (!a.awaiting) return NO_HOST_ATTENTION;
  return {
    awaiting: true,
    kind: typeof a.kind === "string" && KINDS.has(a.kind) ? a.kind : null,
    since: typeof a.since === "number" ? a.since : null
  };
};
const channel = createPushChannel({
  pushType: HOST_ATTENTION,
  requestType: REQUEST_HOST_ATTENTION,
  initial: NO_HOST_ATTENTION,
  parse: (msg) => parseHostAttention(msg.attention)
});
const getHostAttention = () => channel.get();
const onHostAttentionChange = (listener) => channel.onChange(listener);
const useHostAttention = () => channel.use();
export {
  NO_HOST_ATTENTION,
  getHostAttention,
  onHostAttentionChange,
  useHostAttention
};
//# sourceMappingURL=hostAttention.js.map