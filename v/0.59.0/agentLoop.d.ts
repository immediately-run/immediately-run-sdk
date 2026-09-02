import { SteerMessage, SteerSource } from './agentSteering.js';

type TextBlock = {
    type: 'text';
    text: string;
};
/**
 * An image the model can look at (R3-339). `data` is base64 with no `data:` prefix,
 * matching the SDK `ContentPart` the transport already accepts.
 *
 * Carried as its OWN block rather than stuffed inside a `tool_result`, because a tool
 * result's content is a string on the wire — the loop appends the image to the same
 * user message that carries the results, which is the shape both host adapters map.
 */
type ImageBlock = {
    type: 'image';
    mimeType: string;
    data: string;
};
/**
 * A block of the model's own reasoning (R3-335).
 *
 * Kept in the message sequence rather than rendered and thrown away, for two reasons:
 * the user needs to see what the model is doing during the long stretches compaction
 * now makes possible, and some providers REQUIRE the block echoed back — with its
 * `signature` — for the following turn of a tool-use chain to stay valid. A loop that
 * drops them is quietly lossy in a way that shows up as degraded output, not an error.
 *
 * `redactedData` carries provider-redacted reasoning: opaque bytes with no readable
 * text, which still have to be replayed in place. Never render it.
 */
type ReasoningBlock = {
    type: 'reasoning';
    text: string;
    signature?: string;
    redactedData?: string;
};
type ToolUseBlock = {
    type: 'tool_use';
    id: string;
    name: string;
    input: Record<string, unknown>;
};
type ToolResultBlock = {
    type: 'tool_result';
    tool_use_id: string;
    content: string;
    is_error?: boolean;
};
type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock | ImageBlock | ReasoningBlock;
/** A tool the model may call: name, description, and a JSON Schema for its input
 * (`input_schema`, the Anthropic wire name — {@link createChatModelClient} maps it to the
 * chat slot's `ToolDef`). */
interface AgentTool {
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
}
type AgentRole = 'user' | 'assistant';
interface AgentMessage {
    role: AgentRole;
    content: ContentBlock[];
}
/** Provider-reported token counts for one turn (R3-220). `inputTokens` is the size
 *  of everything the provider processed this turn; `outputTokens` is what it
 *  generated. Absent when the provider emits no `usage` delta. */
interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    /** R3-336 — prompt-cache counters, present only where the provider reports them.
     *  ABSENT is not zero: it means this provider says nothing about caching, which is a
     *  different fact from "nothing was cached", and conflating them would turn a
     *  measurement into a guess. */
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
}
/** One model turn: the assistant's emitted blocks + why it stopped (+ usage). */
interface ModelResponse {
    content: (TextBlock | ToolUseBlock | ReasoningBlock)[];
    /** Anthropic stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal' | … */
    stopReason: string;
    /** Provider token counts for this turn, when reported (R3-220 accounting). */
    usage?: TokenUsage;
}
/** The provider seam — one model turn. Implemented by `chatModelClient.ts` over
 *  the host `chat()` slot; faked in tests. When the client streams, it calls
 *  `onTextDelta` with each token slice as it arrives (the assembled turn is still
 *  returned whole); a non-streaming client simply never calls it. */
interface ModelClient {
    createMessage(req: {
        system?: string;
        messages: AgentMessage[];
        tools: AgentTool[];
        /** Called with incremental assistant-text slices during a streamed turn. */
        onTextDelta?: (text: string) => void;
        /** R3-335: incremental REASONING slices, for a live thinking surface. Never called
         *  by a provider that does not emit reasoning. */
        onReasoningDelta?: (text: string) => void;
        /** R3-224: aborts the in-flight turn — the host stops the upstream provider
         *  request and stops billing, not just the app-side stream (§3.3). */
        signal?: AbortSignal;
    }): Promise<ModelResponse>;
}
/** Executes one tool call, returning a string result (and whether it errored —
 *  a `forbidden`/failed call comes back as `is_error` so the model can adapt). */
type ToolExecutor = (name: string, input: Record<string, unknown>) => Promise<ToolOutcome>;
/** What one tool call produced. `images` (R3-339) is how a tool hands the model
 *  something to LOOK at; `content` still carries the text the model reads. */
interface ToolOutcome {
    content: string;
    isError?: boolean;
    images?: ImageBlock[];
}
/** Why a no-tool-call turn looked like a stall rather than a genuine finish. */
type StallReason = 'empty' | 'announced-no-call';
/** Optional UI hooks so a panel can render the loop as it runs. */
interface AgentEvents {
    /** A streamed token slice of the in-flight assistant turn (live preview). */
    onAssistantDelta?(text: string): void;
    /** The complete assistant text for a turn, once the turn is in. */
    onAssistantText?(text: string): void;
    onToolUse?(name: string, input: Record<string, unknown>): void;
    onToolResult?(name: string, result: ToolOutcome): void;
    /** Fired when the loop nudges a STALLED turn (the model ended without a tool
     *  call despite empty or "I'll do X" intent text) back into action, so a panel
     *  can show "nudging the model to continue" rather than a silent stall. */
    onNudge?(reason: StallReason): void;
    /** Fired after every turn with the running context size + window (R3-220
     *  loop-observability). `contextTokens` is provider-reported when available, else
     *  a char/4 estimate. */
    onUsage?(usage: {
        contextTokens: number;
        window?: number;
        spentTokens: number;
        /** R3-336 — cumulative cache reads/writes across the run, on providers that report
         *  them. Surfacing this is what makes the caching claim verifiable rather than
         *  believed; `undefined` means the provider reported nothing. */
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
    }): void;
    /** Fired when the loop compacts the transcript to stay under the context window;
     *  `summarizedCount` is how many older messages were folded into the summary.
     *
     *  R3-336: a compaction invalidates the conversation-prefix cache it rewrote — the
     *  durable system+tools prefix survives it — so the next turn pays one prefix
     *  re-write. `cacheReadTokens`/`cacheWriteTokens` are the run totals AT the
     *  compaction, which is what lets the cost curve across it be read off rather than
     *  assumed (exit 2). */
    onCompact?(info: {
        summarizedCount: number;
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
    }): void;
    /** Fired when the loop stops because the token/spend budget was exhausted. */
    onBudgetStop?(info: {
        spentTokens: number;
        tokenBudget: number;
    }): void;
    /** Fired when a turn was truncated (`max_tokens`) while emitting tool calls, so
     *  the partial calls were failed-and-re-prompted rather than executed (R3-220 F3). */
    onTruncatedToolCall?(): void;
    /** R3-335: a streamed slice of the model's reasoning, for a live thinking surface. */
    onReasoningDelta?(text: string): void;
    /** R3-335: the complete reasoning block for a turn, once the turn is in. */
    onReasoning?(block: ReasoningBlock): void;
    /** R3-333: the loop applied the user's mid-run correction(s). `interrupted` is
     *  true when an `interrupt`-mode steer cut an in-flight model turn short (as
     *  opposed to being applied at an ordinary turn boundary). */
    onSteer?(info: {
        messages: SteerMessage[];
        interrupted: boolean;
    }): void;
}
interface RunAgentOptions {
    client: ModelClient;
    tools: AgentTool[];
    execute: ToolExecutor;
    system?: string;
    /** Prior turns of this conversation, replayed before the new prompt so a
     *  follow-up has context (the conversation stage seeds this from the store). */
    history?: AgentMessage[];
    /** The user's instruction that kicks off the loop. */
    prompt: string;
    /** Large safety-stop on model turns (default 100). No longer the primary bound —
     *  a long task is bounded by `tokenBudget` + compaction; this just backstops a
     *  pathological loop the budget/compaction somehow miss. */
    maxTurns?: number;
    /** Max consecutive "you announced work but emitted no tool call" nudges before
     *  the loop gives up (default 1). GLM-over-OpenRouter intermittently ends a turn
     *  with future-tense intent ("I'll read the files…") or an EMPTY turn right after
     *  a tool error — no tool call, a silent stall (tutorial findings §2). One nudge
     *  recovers most of these; the cap keeps a genuinely-finished model (which answers
     *  the nudge with another call-free turn) from looping, and the budget resets on
     *  any turn that DID call a tool, so a long task's later stall is still covered.
     *  Set 0 to disable the backstop. */
    maxNudges?: number;
    /** The resolved provider's context window (`describeChat().features.maxContextTokens`).
     *  Compaction is disabled when this is absent/0 — the loop then behaves as before. */
    contextWindow?: number;
    /** Headroom left below the window before compacting (default: 25% of the window). */
    reserveTokens?: number;
    /** Recent messages kept verbatim across a compaction (default 8). */
    keepRecentTurns?: number;
    /** Cumulative token budget (input+output across turns). When exceeded the loop
     *  stops — the runaway-cost guard that replaces the raw 12-turn cap. Off when unset. */
    tokenBudget?: number;
    /** Max consecutive truncated-tool-call re-prompts before giving up (default 2). */
    maxTruncationRetries?: number;
    /** R3-224 (§3.3): the stop button. When it fires the loop stops between turns AND
     *  aborts the in-flight model turn (the host tears down the upstream provider
     *  request and stops billing) — not merely the between-turn loop. The transcript so
     *  far is returned; an abort is a clean stop, never a thrown error. */
    signal?: AbortSignal;
    /** R3-333: the mid-run steering queue. The loop drains it at every turn boundary
     *  and folds each correction in as a `user` message, so the human can redirect a
     *  run without restarting it and paying for the transcript again. Its `interrupt`
     *  signal aborts the in-flight MODEL turn only — never a tool batch, which must
     *  keep every `tool_use` paired with a `tool_result`. Absent ⇒ the loop behaves
     *  exactly as before. */
    steering?: SteerSource;
    events?: AgentEvents;
}
/**
 * Classify a NO-tool-call turn as a stall (nudge-worthy) vs a genuine finish.
 * GLM-over-OpenRouter intermittently (a) writes "I'll read the files…" then ends
 * with no call, or (b) returns an EMPTY turn after a tool error — both silent
 * give-ups (tutorial findings §2). Conservative on purpose: a real wrap-up (a
 * summary, "Done", "I've created…") returns null so the loop never nudges a
 * finished agent. Empty text is always a stall (there is nothing a finished agent
 * would say with zero words).
 */
declare function detectStall(text: string): StallReason | null;
declare const NUDGE_TEXT = "You ended your turn without calling a tool. If the task is already complete, say so plainly in one line and stop. Otherwise don't just describe the next step \u2014 emit the tool call now.";
/** Rough token estimate (~4 chars/token) over a message array, used only when the
 *  provider reports no `usage` delta. Conservative by design (over- not under-counts
 *  by treating structured blocks as their JSON length). */
declare function estimateTokens(messages: AgentMessage[]): number;
/** Should the loop compact now? True once the running context passes
 *  `window − reserveTokens`. Disabled (false) when there is no window. */
declare function shouldCompact(contextTokens: number, window: number | undefined, reserveTokens: number): boolean;
/** Prefix marking a `user` message as a compaction summary (not a real user turn),
 *  so the transcript renderer shows a "compacted N turns" affordance on replay. */
declare const COMPACTION_MARKER = "\u241F[compacted-context]\n";
/** Compact `messages` by folding the older head into a structured summary and keeping
 *  a verbatim recent tail. The tail is snapped to start at an `assistant` message so a
 *  `tool_use`/`tool_result` pair is never split (which would malform the next request).
 *  The taint tier is NOT modelled on messages (it is run-scoped host state, R-ASG-2):
 *  this is a pure content transform over the SAME session — it starts no new external
 *  read — so it cannot launder taint (F6). Returns the original array unchanged when
 *  there is nothing safe to summarize. */
declare function compactTranscript(messages: AgentMessage[], client: ModelClient, keepRecentTurns: number): Promise<{
    messages: AgentMessage[];
    summarizedCount: number;
}>;
/** Does this thrown error look like a hard context-window overflow? Used to trigger
 *  recover-then-retry compaction (F3/exit-c) rather than a dead loop. */
declare function isContextOverflow(e: unknown): boolean;
/**
 * Drive the agent loop to completion. Returns the full message transcript
 * (including the kickoff user turn). Stops when the model returns without tool
 * calls (or a terminal stop reason), when the token budget is exhausted, or when
 * `maxTurns` (a large safety-stop) is reached. With a `contextWindow` set, the loop
 * accounts tokens and compacts automatically so it can run long.
 */
declare function runAgent(opts: RunAgentOptions): Promise<AgentMessage[]>;

export { type AgentEvents, type AgentMessage, type AgentRole, type AgentTool, COMPACTION_MARKER, type ContentBlock, type ImageBlock, type ModelClient, type ModelResponse, NUDGE_TEXT, type ReasoningBlock, type RunAgentOptions, type StallReason, type TextBlock, type TokenUsage, type ToolExecutor, type ToolOutcome, type ToolResultBlock, type ToolUseBlock, compactTranscript, detectStall, estimateTokens, isContextOverflow, runAgent, shouldCompact };
