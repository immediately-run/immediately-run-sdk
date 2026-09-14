import "./chunk-VHAA22YE.js";
import { chat } from "./llm";
function toChatMessages(system, messages) {
  const out = [];
  if (system) out.push({ role: "system", content: [{ type: "text", text: system }] });
  for (const m of messages) {
    const content = m.content.map((b) => {
      if (b.type === "text") return { type: "text", text: b.text };
      if (b.type === "tool_use") return { type: "tool-use", id: b.id, name: b.name, input: b.input };
      if (b.type === "image") return { type: "image", mimeType: b.mimeType, data: b.data };
      if (b.type === "reasoning") {
        return b.redactedData !== void 0 ? { type: "reasoning-redacted", data: b.redactedData } : { type: "reasoning", text: b.text, ...b.signature ? { signature: b.signature } : {} };
      }
      return {
        type: "tool-result",
        toolCallId: b.tool_use_id,
        content: b.content,
        ...b.is_error ? { isError: true } : {}
      };
    });
    out.push({ role: m.role, content });
  }
  return out;
}
function toChatTools(tools) {
  return tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.input_schema }));
}
const mapStop = (s) => s === "tool" ? "tool_use" : s === "length" ? "max_tokens" : "end_turn";
function createChatModelClient() {
  return {
    async createMessage(req) {
      const chatReq = {
        messages: toChatMessages(req.system, req.messages),
        ...req.tools.length ? { tools: toChatTools(req.tools) } : {},
        modelHint: "smart",
        // Hand the loop's abort signal to the host so a stop aborts the in-flight
        // upstream request (host stops generating + billing), not just the app-side
        // iterator. `chat()` peels it off before the wire params.
        ...req.signal ? { signal: req.signal } : {}
      };
      let text = "";
      const toolUses = [];
      const reasoning = [];
      let stopReason = "end_turn";
      let usage;
      const gen = chat(chatReq);
      for (; ; ) {
        const step = await gen.next();
        if (step.done) {
          stopReason = mapStop(step.value.stopReason);
          break;
        }
        const d = step.value;
        if (d.type === "text-delta") {
          text += d.text;
          req.onTextDelta?.(d.text);
        } else if (d.type === "tool-call") {
          toolUses.push({
            type: "tool_use",
            id: d.id,
            name: d.name,
            input: d.input ?? {}
          });
        } else if (d.type === "reasoning-delta") {
          req.onReasoningDelta?.(d.text);
        } else if (d.type === "reasoning") {
          reasoning.push({ type: "reasoning", text: d.text, ...d.signature ? { signature: d.signature } : {} });
        } else if (d.type === "reasoning-redacted") {
          reasoning.push({ type: "reasoning", text: "", redactedData: d.data });
        } else if (d.type === "usage") {
          usage = {
            inputTokens: d.inputTokens,
            outputTokens: d.outputTokens,
            ...d.cacheReadTokens !== void 0 ? { cacheReadTokens: d.cacheReadTokens } : {},
            ...d.cacheWriteTokens !== void 0 ? { cacheWriteTokens: d.cacheWriteTokens } : {}
          };
        }
      }
      const content = [...reasoning];
      if (text) content.push({ type: "text", text });
      content.push(...toolUses);
      return { content, stopReason, ...usage ? { usage } : {} };
    }
  };
}
export {
  createChatModelClient
};
//# sourceMappingURL=agentChatClient.js.map