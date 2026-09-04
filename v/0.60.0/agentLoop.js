import "./chunk-VHAA22YE.js";
import { anySignal, steerWireText, INTERRUPTED_TURN_TEXT } from "./agentSteering";
const textOf = (blocks) => blocks.filter((b) => b.type === "text").map((b) => b.text).join("");
const TERMINAL_STOPS = /* @__PURE__ */ new Set(["max_tokens", "refusal"]);
const INTENT_RE = /\b(i'?ll|i will|i'?m going to|going to|let me|let's|now,? i(?:'?ll| will)?|next,? i(?:'?ll| will)?)\b[\s\S]{0,80}?\b(read|write|edit|creat|add|updat|modif|regist|check|look|call|run|search|grep|list|open|fetch|inspect|review|explor|implement|fix|appl)/i;
const DONE_RE = /\b(done|complete|finished|all set|no (?:further|more) (?:changes|steps)|i(?:'| ha)ve (?:creat|add|updat|made|written|regist|edit|implement|fix|appli)|here'?s (?:a |the )?summ|to summ|in summ)/i;
function detectStall(text) {
  const t = text.trim();
  if (!t) return "empty";
  if (DONE_RE.test(t)) return null;
  if (INTENT_RE.test(t)) return "announced-no-call";
  return null;
}
const NUDGE_TEXT = "You ended your turn without calling a tool. If the task is already complete, say so plainly in one line and stop. Otherwise don't just describe the next step \u2014 emit the tool call now.";
function estimateTokens(messages) {
  let chars = 0;
  for (const m of messages) {
    for (const b of m.content) {
      if (b.type === "text") chars += b.text.length;
      else if (b.type === "tool_use") chars += JSON.stringify(b.input).length + b.name.length;
      else if (b.type === "tool_result") chars += b.content.length;
      else if (b.type === "image") chars += b.data.length;
      else if (b.type === "reasoning") chars += b.text.length + (b.redactedData?.length ?? 0);
    }
  }
  return Math.ceil(chars / 4);
}
function shouldCompact(contextTokens, window, reserveTokens) {
  if (!window || window <= 0) return false;
  return contextTokens > window - reserveTokens;
}
const COMPACTION_MARKER = "\u241F[compacted-context]\n";
const SUMMARY_SYSTEM = "You are compacting a coding-agent transcript to fit the context window. Produce a DENSE structured summary under these exact headings: Goal / Constraints / Progress / Decisions / Next Steps / Critical Context. PRESERVE VERBATIM every file path, symbol/identifier, and error string that later steps will need \u2014 do not paraphrase them. Be terse everywhere else. Output only the summary.";
const SUMMARY_INSTRUCTION = "Summarize everything above into the structured block. Keep exact paths, symbols, and error strings verbatim so work can continue from the summary alone.";
async function compactTranscript(messages, client, keepRecentTurns) {
  if (messages.length <= keepRecentTurns + 1) return { messages, summarizedCount: 0 };
  const boundary = Math.max(1, messages.length - keepRecentTurns);
  let tailStart = -1;
  for (let i = boundary; i < messages.length; i++) {
    if (messages[i].role === "assistant") {
      tailStart = i;
      break;
    }
  }
  if (tailStart === -1) {
    for (let i = messages.length - 1; i >= 1; i--) {
      if (messages[i].role === "assistant") {
        tailStart = i;
        break;
      }
    }
  }
  if (tailStart <= 0) return { messages, summarizedCount: 0 };
  const head = messages.slice(0, tailStart);
  const tail = messages.map(dropImages).map(dropReasoning).slice(tailStart);
  const reqMessages = head.map((m) => ({ role: m.role, content: [...m.content] }));
  const lastMsg = reqMessages[reqMessages.length - 1];
  if (lastMsg && lastMsg.role === "user") {
    lastMsg.content = [...lastMsg.content, { type: "text", text: SUMMARY_INSTRUCTION }];
  } else {
    reqMessages.push({ role: "user", content: [{ type: "text", text: SUMMARY_INSTRUCTION }] });
  }
  let summaryText = "(summary unavailable)";
  try {
    const res = await client.createMessage({ system: SUMMARY_SYSTEM, messages: reqMessages, tools: [] });
    summaryText = textOf(res.content).trim() || summaryText;
  } catch {
    return { messages, summarizedCount: 0 };
  }
  const summaryMsg = {
    role: "user",
    content: [{ type: "text", text: COMPACTION_MARKER + summaryText }]
  };
  return { messages: [summaryMsg, ...tail], summarizedCount: head.length };
}
function dropBlocks(m, kind) {
  if (!m.content.some((b) => b.type === kind)) return m;
  const kept = m.content.filter((b) => b.type !== kind);
  return { role: m.role, content: kept.length ? kept : [{ type: "text", text: "" }] };
}
const dropImages = (m) => dropBlocks(m, "image");
const dropReasoning = (m) => dropBlocks(m, "reasoning");
function isContextOverflow(e) {
  const msg = (e?.message ?? String(e)).toLowerCase();
  const code = String(e?.code ?? "").toLowerCase();
  return code.includes("context_length") || code.includes("context-length") || /context (?:length|window)|maximum context|too many tokens|prompt is too long|reduce the length/.test(msg);
}
const TRUNCATED_RETRY_TEXT = "That turn was cut off at the token limit mid tool-call, so the call was NOT executed. Emit a smaller step: fewer/shorter tool calls, or a smaller file write.";
const cacheCounterFields = (cacheReadTokens, cacheWriteTokens) => ({
  ...cacheReadTokens !== void 0 ? { cacheReadTokens } : {},
  ...cacheWriteTokens !== void 0 ? { cacheWriteTokens } : {}
});
async function runAgent(opts) {
  const { client, tools, execute, system, prompt, events, signal, steering } = opts;
  const maxTurns = opts.maxTurns ?? 100;
  const maxNudges = opts.maxNudges ?? 1;
  const maxTruncationRetries = opts.maxTruncationRetries ?? 2;
  const window = opts.contextWindow;
  const reserveTokens = opts.reserveTokens ?? (window ? Math.floor(window * 0.25) : 0);
  const keepRecentTurns = opts.keepRecentTurns ?? 8;
  let messages = [...opts.history ?? [], { role: "user", content: [{ type: "text", text: prompt }] }];
  let nudges = 0;
  let truncationRetries = 0;
  let interruptedLastTurn = false;
  let contextTokens = 0;
  let spentTokens = 0;
  let cacheReadTokens;
  let cacheWriteTokens;
  const compactAndReport = async () => {
    const { messages: compacted, summarizedCount } = await compactTranscript(messages, client, keepRecentTurns);
    if (summarizedCount > 0) {
      messages = compacted;
      contextTokens = estimateTokens(messages);
      events?.onCompact?.({ summarizedCount, ...cacheCounterFields(cacheReadTokens, cacheWriteTokens) });
    }
    return summarizedCount;
  };
  for (let turn = 0; turn < maxTurns; turn++) {
    if (signal?.aborted) break;
    if (steering) {
      const steers = steering.drain();
      if (steers.length) {
        messages.push({
          role: "user",
          content: steers.map((m) => ({ type: "text", text: steerWireText(m) }))
        });
        events?.onSteer?.({ messages: steers, interrupted: interruptedLastTurn });
      }
      interruptedLastTurn = false;
      steering.rearm();
    }
    if (shouldCompact(contextTokens, window, reserveTokens)) await compactAndReport();
    const turnAbort = anySignal([signal, steering?.interrupt]);
    let partialText = "";
    const onTextDelta = (text) => {
      partialText += text;
      events?.onAssistantDelta?.(text);
    };
    const sendTurn = () => client.createMessage({
      system,
      messages,
      tools,
      // R3-333's local `onTextDelta` (it captures the partial text a steer may cut
      // short) — NOT `events.onAssistantDelta` directly.
      onTextDelta,
      // R3-335's reasoning stream rides alongside it.
      onReasoningDelta: events?.onReasoningDelta,
      // R3-333: STOP composed with the steer INTERRUPT, so either verb ends the turn.
      signal: turnAbort.signal
    });
    let res;
    try {
      try {
        res = await sendTurn();
      } catch (e) {
        if (turnAbort.signal.aborted || !isContextOverflow(e)) throw e;
        if (await compactAndReport() === 0) throw e;
        res = await sendTurn();
      }
    } catch (e) {
      if (signal?.aborted) {
        turnAbort.dispose();
        break;
      }
      if (steering?.interrupt.aborted) {
        turnAbort.dispose();
        messages.push({
          role: "assistant",
          content: [{ type: "text", text: partialText.trim() || INTERRUPTED_TURN_TEXT }]
        });
        events?.onAssistantText?.(partialText.trim() || INTERRUPTED_TURN_TEXT);
        interruptedLastTurn = true;
        continue;
      }
      turnAbort.dispose();
      throw e;
    }
    turnAbort.dispose();
    const turnCost = res.usage ? res.usage.inputTokens + res.usage.outputTokens : estimateTokens(messages) + Math.ceil(textOf(res.content).length / 4);
    contextTokens = turnCost;
    spentTokens += turnCost;
    if (res.usage?.cacheReadTokens !== void 0) {
      cacheReadTokens = (cacheReadTokens ?? 0) + res.usage.cacheReadTokens;
    }
    if (res.usage?.cacheWriteTokens !== void 0) {
      cacheWriteTokens = (cacheWriteTokens ?? 0) + res.usage.cacheWriteTokens;
    }
    events?.onUsage?.({
      contextTokens,
      window,
      spentTokens,
      ...cacheCounterFields(cacheReadTokens, cacheWriteTokens)
    });
    const assistantText = textOf(res.content);
    if (assistantText) events?.onAssistantText?.(assistantText);
    for (const b of res.content) if (b.type === "reasoning") events?.onReasoning?.(b);
    messages.push({ role: "assistant", content: res.content });
    const toolUses = res.content.filter((b) => b.type === "tool_use");
    if (res.stopReason === "max_tokens" && toolUses.length > 0) {
      events?.onTruncatedToolCall?.();
      const failed = toolUses.map((c) => ({
        type: "tool_result",
        tool_use_id: c.id,
        content: "tool call truncated by the token limit \u2014 not executed",
        is_error: true
      }));
      failed.push({ type: "text", text: TRUNCATED_RETRY_TEXT });
      messages.push({ role: "user", content: failed });
      if (++truncationRetries > maxTruncationRetries) break;
      continue;
    }
    truncationRetries = 0;
    if (toolUses.length === 0) {
      const stall = TERMINAL_STOPS.has(res.stopReason) ? null : detectStall(assistantText);
      if (stall && nudges < maxNudges) {
        nudges++;
        events?.onNudge?.(stall);
        messages.push({ role: "user", content: [{ type: "text", text: NUDGE_TEXT }] });
        continue;
      }
      if (steering?.hasPending()) continue;
      break;
    }
    nudges = 0;
    const results = [];
    const images = [];
    for (const call of toolUses) {
      events?.onToolUse?.(call.name, call.input);
      let outcome;
      try {
        outcome = await execute(call.name, call.input);
      } catch (e) {
        const code = e?.code;
        const msg = e?.message ?? String(e);
        outcome = { content: code ? `${code}: ${msg}` : msg, isError: true };
      }
      events?.onToolResult?.(call.name, outcome);
      results.push({
        type: "tool_result",
        tool_use_id: call.id,
        content: outcome.content,
        is_error: outcome.isError
      });
      if (outcome.images?.length) images.push(...outcome.images);
    }
    messages.push({ role: "user", content: [...results, ...images] });
    if (opts.tokenBudget && spentTokens >= opts.tokenBudget) {
      events?.onBudgetStop?.({ spentTokens, tokenBudget: opts.tokenBudget });
      break;
    }
  }
  return messages;
}
export {
  COMPACTION_MARKER,
  NUDGE_TEXT,
  compactTranscript,
  detectStall,
  estimateTokens,
  isContextOverflow,
  runAgent,
  shouldCompact
};
//# sourceMappingURL=agentLoop.js.map