// A {@link ModelClient} (the `agentLoop.ts` provider seam) backed by the host
// `llm.chat` slot — the SDK {@link chat} stream. PORTED from agent-demo
// `src/lib/chatModelClient.ts` (GROVE_AGENT_SPEC §7: the loop seam, shared).
//
// The provider AND the model are the USER's host-side preference — this client names
// neither. The app holds no secret/`net:fetch` grant; it needs only the `llm:chat`
// capability (elevated, app-scoped: a fork earns it by ordinary consent).
import { chat } from './llm';
import type { ChatRequest, ChatDelta, ContentPart } from './llm';
import type { AgentMessage, ModelClient, ReasoningBlock, TextBlock, TokenUsage, ToolUseBlock } from './agentLoop';
import type { AgentTool } from './agentLoop';

// The loop's Anthropic-shaped conversation → the chat slot's tool-aware ChatRequest.
// The agentic history round-trips: a `tool_use` block becomes a `tool-use` content
// part, a `tool_result` becomes a `tool-result` part.
function toChatMessages(system: string | undefined, messages: AgentMessage[]): ChatRequest['messages'] {
  const out: ChatRequest['messages'] = [];
  if (system) out.push({ role: 'system', content: [{ type: 'text', text: system }] });
  for (const m of messages) {
    const content: ContentPart[] = m.content.map((b): ContentPart => {
      if (b.type === 'text') return { type: 'text', text: b.text };
      if (b.type === 'tool_use') return { type: 'tool-use', id: b.id, name: b.name, input: b.input };
      // An image the model should LOOK at (the transport already accepts it when the
      // provider advertises `features.vision`).
      if (b.type === 'image') return { type: 'image', mimeType: b.mimeType, data: b.data };
      // Echo the model's own reasoning back. Some providers REQUIRE it (with its
      // signature) for the next turn of a tool-use chain to be accepted; the host
      // adapter puts it in the position that provider wants.
      if (b.type === 'reasoning') {
        return b.redactedData !== undefined
          ? { type: 'reasoning-redacted', data: b.redactedData }
          : { type: 'reasoning', text: b.text, ...(b.signature ? { signature: b.signature } : {}) };
      }
      return {
        type: 'tool-result',
        toolCallId: b.tool_use_id,
        content: b.content,
        ...(b.is_error ? { isError: true } : {}),
      };
    });
    out.push({ role: m.role, content });
  }
  return out;
}

function toChatTools(tools: AgentTool[]): NonNullable<ChatRequest['tools']> {
  return tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.input_schema }));
}

// ChatResult.stopReason ('end'|'length'|'tool'|'filtered') → the loop's
// Anthropic-style stop reason (the loop branches on 'tool_use' to keep iterating).
const mapStop = (s: string): string => (s === 'tool' ? 'tool_use' : s === 'length' ? 'max_tokens' : 'end_turn');

/** A {@link ModelClient} over the host `llm.chat` slot. Streams text deltas (forwarded
 * to `onTextDelta`) and assembles tool calls; the resolved provider + model are the
 * user's preference, never named here. Requires the `llm:chat` capability. */
export function createChatModelClient(): ModelClient {
  return {
    async createMessage(req) {
      const chatReq: ChatRequest = {
        messages: toChatMessages(req.system, req.messages),
        ...(req.tools.length ? { tools: toChatTools(req.tools) } : {}),
        modelHint: 'smart',
        // Hand the loop's abort signal to the host so a stop aborts the in-flight
        // upstream request (host stops generating + billing), not just the app-side
        // iterator. `chat()` peels it off before the wire params.
        ...(req.signal ? { signal: req.signal } : {}),
      };
      let text = '';
      const toolUses: ToolUseBlock[] = [];
      // Reasoning blocks for this turn, in the order the provider emitted them.
      const reasoning: ReasoningBlock[] = [];
      let stopReason = 'end_turn';
      // The provider `usage` delta — the loop reads it to drive compaction/spend
      // rather than discarding it. Absent when the provider reports none; the loop
      // then falls back to a char/4 estimate.
      let usage: TokenUsage | undefined;
      const gen = chat(chatReq);
      for (;;) {
        const step = await gen.next();
        if (step.done) {
          stopReason = mapStop(step.value.stopReason);
          break;
        }
        const d: ChatDelta = step.value;
        if (d.type === 'text-delta') {
          text += d.text;
          req.onTextDelta?.(d.text);
        } else if (d.type === 'tool-call') {
          toolUses.push({
            type: 'tool_use',
            id: d.id,
            name: d.name,
            input: (d.input ?? {}) as Record<string, unknown>,
          });
        } else if (d.type === 'reasoning-delta') {
          // Live only — the WHOLE block arrives as its own delta, carrying the
          // signature. Accumulating the slices here instead would silently lose it.
          req.onReasoningDelta?.(d.text);
        } else if (d.type === 'reasoning') {
          reasoning.push({ type: 'reasoning', text: d.text, ...(d.signature ? { signature: d.signature } : {}) });
        } else if (d.type === 'reasoning-redacted') {
          reasoning.push({ type: 'reasoning', text: '', redactedData: d.data });
        } else if (d.type === 'usage') {
          // Carry the cache counters through verbatim, INCLUDING their absence: a
          // provider that reports nothing must not look like one that cached nothing.
          usage = {
            inputTokens: d.inputTokens,
            outputTokens: d.outputTokens,
            ...(d.cacheReadTokens !== undefined ? { cacheReadTokens: d.cacheReadTokens } : {}),
            ...(d.cacheWriteTokens !== undefined ? { cacheWriteTokens: d.cacheWriteTokens } : {}),
          };
        }
      }
      // Reasoning comes FIRST in the turn: it is what the model did before answering,
      // and it is the order a provider that requires the echo expects to read back.
      const content: (TextBlock | ToolUseBlock | ReasoningBlock)[] = [...reasoning];
      if (text) content.push({ type: 'text', text });
      content.push(...toolUses);
      return { content, stopReason, ...(usage ? { usage } : {}) };
    },
  };
}
