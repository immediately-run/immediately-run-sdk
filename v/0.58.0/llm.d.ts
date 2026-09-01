/** Who authored a {@link ChatMessage}. */
type ChatRole = 'system' | 'user' | 'assistant' | 'tool';
/** A part of a message. `image` is only honored when the resolved provider
 *  advertises `features.vision` (§2.5); `tool-use`/`tool-result` only when it
 *  advertises `features.tools` — branch on {@link describeChat} first. */
type ContentPart = {
    type: 'text';
    text: string;
} | {
    type: 'image';
    mimeType: string;
    data: string;
} | {
    type: 'tool-use';
    id: string;
    name: string;
    input: Record<string, unknown>;
} | {
    type: 'reasoning';
    text: string;
    signature?: string;
} | {
    type: 'reasoning-redacted';
    data: string;
} | {
    type: 'tool-result';
    toolCallId: string;
    content: string;
    isError?: boolean;
};
/** One message in a {@link ChatRequest}: a role plus its content parts. */
interface ChatMessage {
    role: ChatRole;
    content: ContentPart[];
}
/** A tool the model may call — honored only when `features.tools`. */
interface ToolDef {
    name: string;
    description?: string;
    /** JSON-Schema for the tool's arguments. */
    inputSchema: Record<string, unknown>;
}
/** A host-brokered chat completion request: the messages plus optional tools,
 *  response format, and model hint (each honored per the provider's features). */
interface ChatRequest {
    messages: ChatMessage[];
    /** Honored only when the resolved provider advertises `features.tools`. */
    tools?: ToolDef[];
    /** `'json'` honored only when `features.jsonMode`. Defaults to `'text'`. */
    responseFormat?: 'text' | 'json';
    maxTokens?: number;
    /** An ABSTRACT tier hint, never a vendor model id — the host maps it to a concrete
     *  model on the resolved provider. Omit to take the provider's default. */
    modelHint?: 'fast' | 'smart';
    /** Abort the completion mid-stream. When it fires, the SDK sends the host a cancel
     *  frame so the host aborts the upstream provider request and STOPS BILLING the
     *  user's key — not merely stops the app-side iterator (LLM_AND_AGENTS_SPEC §3.3
     *  "abort the in-flight LLM request", R3-224). Not sent over the wire (an
     *  `AbortSignal` isn't serializable); handled SDK-side. */
    signal?: AbortSignal;
}
/** One streamed chunk. Consumers typically accumulate `text-delta`s. */
type ChatDelta = {
    type: 'text-delta';
    text: string;
} | {
    type: 'tool-call';
    id: string;
    name: string;
    input: unknown;
} | {
    type: 'reasoning-delta';
    text: string;
} | {
    type: 'reasoning';
    text: string;
    signature?: string;
} | {
    type: 'reasoning-redacted';
    data: string;
} | {
    type: 'usage';
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
};
/** Why generation stopped: natural `end`, `length` cap, a `tool` call, or content `filtered`. */
type ChatStopReason = 'end' | 'length' | 'tool' | 'filtered';
/** The terminal value of the {@link chat} stream. */
interface ChatResult {
    stopReason: ChatStopReason;
}
/**
 * Stream a chat completion from whichever provider the user has configured.
 *
 * ```ts
 * let summary = '';
 * for await (const d of chat({ messages: [{ role: 'user', content: [{ type: 'text', text }] }] })) {
 *   if (d.type === 'text-delta') summary += d.text;
 * }
 * ```
 *
 * Requires the `llm:chat` capability. If no provider is bound, the host first
 * draws the SP-7 connect-me gate itself (R3-456: the app never draws a
 * credential prompt — that is host chrome, SECRETS_SPEC S3):
 * - the user connects a key → the call retries once and streams normally;
 * - the user declines → the generator throws `code: 'cancelled'` (the same code
 *   a declined powerbox produces — a working degraded state: catch it and
 *   degrade, e.g. skip the AI feature);
 * - an older host without the gate throws `code: 'provider-not-configured'`.
 * A signed-out user throws `code: 'auth-required'`; an un-granted call throws
 * `forbidden`.
 */
declare function chat(req: ChatRequest): AsyncGenerator<ChatDelta, ChatResult, void>;
/** The resolved provider's advertised abilities (SERVICE_PROVIDERS_SPEC §2.5) — read
 *  to branch/degrade (offer image upload only when `vision`). */
interface ChatFeatures {
    vision: boolean;
    tools: boolean;
    jsonMode: boolean;
    /** R3-335: the provider emits reasoning blocks. Read it to decide whether to render
     *  a thinking surface at all — an empty affordance on a provider that never thinks
     *  is worse than none. Normalized to `false` by the channel when a host predating
     *  R3-335 omits it, so this is never `undefined` in practice. */
    reasoning: boolean;
    maxContextTokens: number;
}
/** Info about the provider the host resolved for this app. `null` when no provider
 *  is bound (SP-7: prompt the user to add a key before calling {@link chat}). */
interface ChatProviderInfo {
    /** Opaque provider id, e.g. `llm.chat.anthropic` — never a vendor secret or model id. */
    providerId: string;
    /** True for Host-proxied providers (host-vouched, SP-9); false for app-level ones,
     *  whose `features` are an untrusted claim. */
    hostVouched: boolean;
    features: ChatFeatures;
}
/**
 * Whether the host has told us about a provider yet, and if so whether one is bound.
 *
 * THREE states, because two is the bug (R3-300). `describeChat()` returns `null` both
 * when no provider is configured AND when the channel has not answered — so an app
 * cannot tell "you need a key" from "ask again in a moment", and consuming apps
 * rendered a misleading "connect a key" banner at users who had one. `unknown` is the
 * state before the host answers; it is not an error and not a prompt to act.
 *
 * **`unknown` is TRANSIENT — the host answers every frame** (R3-419;
 * `LLM_AND_AGENTS_SPEC §4.1` R-LLM-1..3). An app that does not hold `llm:chat` is not
 * met with silence: it is answered `not-configured`, the same terminal state as a user
 * with no key, because from the app's side those are the same fact — do not render a
 * provider, do offer the connect path. So it is correct to treat a `unknown` that
 * persists as a host bug rather than as a state to design around, and WRONG to render a
 * spinner with no timeout on it. (Before R3-419 the host withheld the channel entirely
 * from an ungranted frame, and `unknown` stood forever — that is the failure this note
 * exists to keep from being re-created on the app side.)
 */
type ChatProviderState = {
    status: 'unknown';
} | {
    status: 'not-configured';
} | {
    status: 'configured';
    provider: ChatProviderInfo;
};
/**
 * Fill in feature flags a host older than the field does not send (R3-335).
 *
 * `features.reasoning` arrived after `ChatFeatures` shipped, so a host predating it
 * omits the key. `undefined` reads as falsy everywhere EXCEPT a `'reasoning' in
 * features` check, which is exactly the kind of difference that produces one wrong
 * branch a year later — so it is normalized here, once, rather than left to every
 * caller. Absent means "does not reason": the fail-closed reading.
 *
 * Exported for its own test; not part of the public surface (`index.ts` re-exports
 * this module wholesale, so it is reachable — it is documented as internal rather
 * than hidden behind a lie).
 * @internal
 */
declare function normalizeProviderInfo(provider: ChatProviderInfo | null): ChatProviderInfo | null;
/**
 * The provider the host resolved for this app, or `null`.
 *
 * Kept for compatibility (`ways_of_working §6`, additive-only): it collapses `unknown`
 * and `not-configured` to `null`. Prefer {@link describeChatState} when the difference
 * matters — which is any time you would render "connect a key", because doing that in
 * the `unknown` state is exactly the false banner R3-300 fixes.
 */
declare const describeChat: () => ChatProviderInfo | null;
/** The three-state read: `unknown` before the host answers, then configured or not. */
declare const describeChatState: () => ChatProviderState;
/** Subscribe to provider changes (key added/revoked, preference changed). Invoked
 *  immediately with the current value, then on every change. Returns unsubscribe. */
declare const onChatProviderChange: (listener: (provider: ChatProviderInfo | null) => void) => (() => void);
/** Subscribe to the three-state provider description. */
declare const onChatProviderStateChange: (listener: (state: ChatProviderState) => void) => (() => void);
/** React hook returning the resolved chat provider (or `null`), re-rendering on
 *  change — gate the summarize affordance on `provider !== null`. */
declare const useChatProvider: () => ChatProviderInfo | null;
/**
 * React hook returning the three-state description.
 *
 * Use this to render provider state honestly: show nothing (or a neutral placeholder)
 * while `unknown`, the connect affordance only on `not-configured`, and the provider's
 * name on `configured`.
 */
declare const useChatProviderState: () => ChatProviderState;

export { type ChatDelta, type ChatFeatures, type ChatMessage, type ChatProviderInfo, type ChatProviderState, type ChatRequest, type ChatResult, type ChatRole, type ChatStopReason, type ContentPart, type ToolDef, chat, describeChat, describeChatState, normalizeProviderInfo, onChatProviderChange, onChatProviderStateChange, useChatProvider, useChatProviderState };
