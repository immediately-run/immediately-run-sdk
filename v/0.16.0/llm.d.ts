/** Who authored a {@link ChatMessage}. */
type ChatRole = 'system' | 'user' | 'assistant' | 'tool';
/** A part of a message. `image` is only honored when the resolved provider
 *  advertises `features.vision` (§2.5) — branch on {@link describeChat} first. */
type ContentPart = {
    type: 'text';
    text: string;
} | {
    type: 'image';
    mimeType: string;
    data: string;
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
    type: 'usage';
    inputTokens: number;
    outputTokens: number;
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
 * Requires the `llm:chat` capability. If no provider is bound the host fails the
 * stream into the SP-7 connect-me prompt (the user adds a key) — the generator
 * throws with `code: 'auth-required'`; an un-granted call throws `forbidden`.
 */
declare function chat(req: ChatRequest): AsyncGenerator<ChatDelta, ChatResult, void>;
/** The resolved provider's advertised abilities (SERVICE_PROVIDERS_SPEC §2.5) — read
 *  to branch/degrade (offer image upload only when `vision`). */
interface ChatFeatures {
    vision: boolean;
    tools: boolean;
    jsonMode: boolean;
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
/** The provider the host resolved for this app (or `null` if none bound). Poll for a
 *  one-off read; use {@link onChatProviderChange}/{@link useChatProvider} to react. */
declare const describeChat: () => ChatProviderInfo | null;
/** Subscribe to provider changes (key added/revoked, preference changed). Invoked
 *  immediately with the current value, then on every change. Returns unsubscribe. */
declare const onChatProviderChange: (listener: (provider: ChatProviderInfo | null) => void) => (() => void);
/** React hook returning the resolved chat provider (or `null`), re-rendering on
 *  change — gate the summarize affordance on `provider !== null`. */
declare const useChatProvider: () => ChatProviderInfo | null;

export { type ChatDelta, type ChatFeatures, type ChatMessage, type ChatProviderInfo, type ChatRequest, type ChatResult, type ChatRole, type ChatStopReason, type ContentPart, type ToolDef, chat, describeChat, onChatProviderChange, useChatProvider };
