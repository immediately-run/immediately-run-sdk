import { ModelKind } from '@immediately-run/sandbox-protocol';
export { ModelKind } from '@immediately-run/sandbox-protocol';

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
    /** A concrete provider-and-model choice, naming one of the user's CONNECTED providers
     *  (R3-620, LLM_AND_AGENTS_SPEC §0 editing-session exception). When present it WINS over
     *  `modelHint`; the host validates the pair against the user's connected set and refuses
     *  with `provider-not-connected` otherwise. Only an editing-session principal may read the
     *  chooseable set (via `describeChat()`'s `connectedProviders`, gated `llm:chooseModel`);
     *  a stage app still passes at most the abstract hint. */
    model?: {
        providerId: string;
        model: string;
    };
    /** A per-request thinking level (R3-1122) — one of the chosen model's
     *  `thinking.levels`; the host refuses anything else with `invalid-params`
     *  naming the model and its levels. Omit for the Settings level, then the
     *  model's default; never sent to a model whose `levels` are empty. */
    thinking?: string;
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
    /** R3-1124 (LLM_AND_AGENTS §4.2): the round's price. The host's estimate from the
     *  catalogue rates unless the provider returned its own cost (OpenRouter's
     *  `usage.cost` — then `estimated` is false and that value wins). Absent when no
     *  rate and no schedule exists — unknown is absent, never zero. Credits are the
     *  plan's own unit, never converted. */
    cost?: {
        amount: number;
        unit: 'usd' | 'credits';
        estimated: boolean;
        rule?: string;
    };
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
 *
 * `provider-not-configured` also fires when a key EXISTS but was never entered
 * under the routing the provider now takes (R3-583, SECRETS_SPEC §2.1 C6 /
 * §7.1 S4): a key an app added through `requestAddSecret`, or one sealed before
 * the provider's row moved to the proxied path, is refused because its routing
 * disclosure was never shown. The host raises the same connect gate in-call,
 * carrying the re-entry door, so the throw means the user declined it or
 * settled without a usable key; the recovery is the user entering the key again
 * under the disclosure. The app cannot repair this itself — surface the refusal
 * (its message is the re-entry instruction). A decline latches for the app's
 * session (TS-19/21: the dialog must not be farmed), so a retry re-throws
 * without re-opening the gate; the user re-enters the key from Settings or in a
 * fresh session. Do not retry in a loop.
 *
 * A signed-out user throws `code: 'auth-required'`; an un-granted call throws
 * `forbidden`.
 */
declare function chat(req: ChatRequest): AsyncGenerator<ChatDelta, ChatResult, void>;
/** An embeddings request: the texts plus an optional concrete model pair. */
interface EmbedRequest {
    /** The texts to embed — at most 256 values and 1 MiB of text per call (the host
     *  refuses larger with `invalid-params`). */
    values: string[];
    /** A concrete model on a connected provider. Requires `llm:chooseModel` ON TOP OF
     *  `llm:model` (the same rule as chat's `model`); absent, the host uses the bound
     *  provider's first embedding model. */
    model?: {
        providerId: string;
        model: string;
    };
}
/** The embeddings reply: one vector per input value, in order. */
interface EmbedResult {
    embeddings: number[][];
    /** The model that answered (the host's choice when the request named none). */
    model: string;
    usage?: {
        inputTokens?: number;
    };
}
/**
 * Embed texts with whichever provider the user has connected — the first non-chat kind
 * on the `llm:model` capability (elevated, app-scoped; earned like `llm:chat`).
 * NOT streamed: one request, one reply. A frame without `llm:model` throws
 * `forbidden`; an over-limit call throws `invalid-params`; no provider with an
 * embedding model throws `unsupported` naming the kind. The same connect-gate and
 * key-routing rules as {@link chat} apply to the resolved provider.
 */
declare function embed(req: EmbedRequest): Promise<EmbedResult>;
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
/** How the resolved provider's requests physically leave the browser. Read it to
 *  DESCRIBE routing where that matters to the person ("runs in your browser" vs
 *  "routed through immediately.run") — never to draw host chrome or a consent prompt,
 *  which remain the host's (UI_AS_APPS §8 T15). */
type ChatExecutor = 'browser-direct' | 'backend-proxied';
/** The concrete model each abstract tier resolves to right now. */
interface ChatTierModels {
    fast: string;
    smart: string;
}
/** One chat model a connected provider offers, described per model (R3-1122): what a
 *  picker sizes itself by. The host sends it as an object entry of a choice's wire
 *  `models` list. It crosses only complete and rebuilt: an entry missing a required
 *  field, or carrying one of the wrong type, is not described at all (its `id` still
 *  joins {@link ChatProviderChoice.models}), and a key not declared here never crosses.
 *  Names, ids, features and prices only — never keys, usage or balance. */
interface ChatModelInfo {
    /** The model id exactly as {@link ChatRequest.model}.model takes it. */
    id: string;
    /** The model's human name, for a picker label. */
    name: string;
    /** This model's features, normalized like the provider-level set (`reasoning` fails
     *  closed to `false`). */
    features: ChatFeatures;
    /** The model's context window in tokens. */
    contextTokens: number;
    /** The model's output limit in tokens. */
    outputTokens: number;
    /** The input modalities the model accepts (e.g. `['text','image']`). */
    inputModalities: string[];
    /** The output modalities the model produces. */
    outputModalities: string[];
    /** The thinking levels the model accepts and the one it uses when a request names
     *  none. `default` is always one of `levels`; `levels` is empty for a model with no
     *  thinking knob, and then `default` means nothing — send no `thinking` to it. */
    thinking: {
        levels: string[];
        default: string;
    };
    /** A price summary per million tokens in `unit`, when the host knows one. */
    pricing?: {
        inputPerMTok: number;
        outputPerMTok: number;
        unit: string;
    };
}
/** One CONNECTED provider the user may choose a model from, for a per-conversation model
 *  choice in an editing-session workbench (R3-620, LLM_AND_AGENTS_SPEC §0). Names and ids
 *  only — never keys, usage, balance or routing. */
interface ChatProviderChoice {
    /** Opaque provider id, e.g. `llm.chat.anthropic` — matches {@link ChatRequest.model}.providerId. */
    providerId: string;
    /** The provider's human name, for a picker label. */
    displayName: string;
    /** The chooseable model ids — the catalogue-recommended set plus the two the user has
     *  chosen. A closed list here would re-introduce the ids-rot problem, so `model` is passed
     *  through to the adapter exactly as the Settings field is; this list is suggestions.
     *  Read from the wire's `modelIds` when a host sends one, else from the wire's `models`:
     *  its string entries plus the `id` of each object entry, described or not. Every host
     *  so far sends `models` as ids only. */
    models: string[];
    /** R3-1122: per-model descriptions of the models above that the host describes, in the
     *  host's order. Absent on a host that sends ids only — today, every host — and when no
     *  entry crossed complete; fall back to {@link ChatProviderChoice.features} then. */
    modelInfo?: ChatModelInfo[];
    /** R3-1074: THIS provider's adapter features, so a run on a chosen provider sizes itself
     *  by that provider's context window and vision rather than the default provider's (or the
     *  conservative nothing). Absent on a host predating the field — keep your conservative
     *  answer then. Optional on the wire, so an older host stays valid. */
    features?: ChatFeatures;
    /** R3-1127 (§4.4): the provider's NON-CHAT models by kind (embeddings first). Sent
     *  only when your frame holds BOTH `llm:model` and `llm:chooseModel`; absent otherwise
     *  and on any older host. Only kinds the host listed a usable model for are present. */
    modelsByKind?: Partial<Record<ModelKind, KindModelInfo[]>>;
}
/** One non-chat model a connected provider offers (R3-1127): its id (what
 *  {@link EmbedRequest.model}.model takes), its human name, and, for an embedding
 *  model, its vector size and per-call input limit, when the host knows them. */
interface KindModelInfo {
    id: string;
    name: string;
    dimensions?: number;
    /** The provider's own limit on values per call. The host's cap on an
     *  {@link EmbedRequest} (256 values, 1 MiB of text) applies first, so the most one
     *  `embed()` call can carry is `min(maxInputs, 256)`. */
    maxInputs?: number;
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
    /** The provider's human name, e.g. `OpenRouter` — what to put in front of a person.
     *  Absent on a host that predates the field: fall back to your own copy rather than
     *  rendering the id, which is a platform identifier and not a name. */
    displayName?: string;
    /** How this provider's requests leave the browser. Absent on a host that predates the
     *  field, which is NOT the same as `browser-direct` — say nothing about routing rather
     *  than guess at it. */
    executor?: ChatExecutor;
    /**
     * The concrete model each {@link ChatRequest.modelHint} tier resolves to — what a
     * `smart` request would actually run, after the user's own preference.
     *
     * Read-only, and it does not weaken `LLM_AND_AGENTS_SPEC §0`: an app still names no
     * model, and {@link ChatRequest} still carries only the abstract hint. It is here so an
     * app can be HONEST about what answered — a transcript that says which model wrote a
     * reply, a warning that names the model about to be spent on — instead of showing a
     * blank where the platform knows the answer. The user picks the model in host settings;
     * the app reports it.
     *
     * Absent on a host that predates the field. It changes when the user changes their
     * preference, so read it through {@link onChatProviderChange} rather than caching it.
     */
    models?: ChatTierModels;
    /**
     * The user's CONNECTED providers and their chooseable models, for a per-conversation
     * model choice (R3-620). Only present when this frame holds the ELEVATED `llm:chooseModel`
     * capability (an editing-session workbench); the host strips it for everyone else, so a
     * stage app sees `undefined` and can offer only the abstract `modelHint` path.
     *
     * Read-only: names and ids only. No keys, usage, balance or routing. Absent also on a host
     * that predates the field.
     */
    connectedProviders?: ChatProviderChoice[];
}
/**
 * Whether the host has told us about a provider yet, and if so whether one is bound —
 * and, since R3-688, whether this frame may ask at all.
 *
 * THREE states, because two is the bug (R3-300). `describeChat()` returns `null` both
 * when no provider is configured AND when the channel has not answered — so an app
 * cannot tell "you need a key" from "ask again in a moment", and consuming apps
 * rendered a misleading "connect a key" banner at users who had one. `unknown` is the
 * state before the host answers; it is not an error and not a prompt to act.
 *
 * **`unknown` is TRANSIENT — the host answers every frame** (R3-419;
 * `LLM_AND_AGENTS_SPEC §4.1` R-LLM-1..3). An app that does not hold `llm:chat` is not
 * met with silence. So it is correct to treat a `unknown` that persists as a host bug
 * rather than as a state to design around, and WRONG to render a spinner with no
 * timeout on it. (Before R3-419 the host withheld the channel entirely from an
 * ungranted frame, and `unknown` stood forever — that is the failure this note exists
 * to keep from being re-created on the app side.)
 *
 * The FOURTH state, `ungranted` (R3-688; `LLM_AND_AGENTS_SPEC §4.1` R-LLM-2 as
 * annotated, `GROVE_AGENT_SPEC` G-GA-10): the host answered, and the reason this frame
 * cannot reach a model is that **it does not hold `llm:chat`** — not that the user has
 * no key. R3-419 deliberately answered an ungranted frame with the same payload as a
 * keyless one, because the SDK could not carry the difference; that made the distinct
 * "not granted" cause the reach-card contract promises (G-GA-10) uncomputable — an
 * ungranted fork of an app rendered "connect a key" at a user who had one. The host now
 * marks the grantless answer with an optional `ungranted: true` on the SAME message
 * (additive — an older SDK never reads the field and degrades to `not-configured`;
 * an older host never sends the field and the app degrades the same way). The mark is
 * HOST-derived from the frame's resolved grant set at push time (the channel view in
 * `channelAcl.ts`), never from anything this frame asserts.
 */
type ChatProviderState = {
    status: 'unknown';
} | {
    status: 'not-configured';
} | {
    status: 'ungranted';
} | {
    status: 'configured';
    provider: ChatProviderInfo;
};
declare function normalizeProviderInfo(provider: ChatProviderInfo | null): ChatProviderInfo | null;
/**
 * Derive the four-state read from what the host has said. Pure, and exported for its
 * own test (`llmProviderState.test.ts`) like `normalizeProviderInfo` — not part of the
 * public surface beyond `index.ts`'s wholesale re-export.
 *
 * Order is load-bearing: `unknown` wins until the host answers (an `ungranted` mark
 * cannot exist before an answer — it arrives ON the answer); then the host's grantless
 * mark; then the provider. A host that predates the mark never sets it, so its
 * grantless answer derives `not-configured` — the exact pre-R3-688 contract, which is
 * the additive degradation the fourth state promises.
 *
 * @internal
 */
declare function deriveChatProviderState(answered: boolean, ungranted: boolean, provider: ChatProviderInfo | null): ChatProviderState;
/**
 * The provider the host resolved for this app, or `null`.
 *
 * Kept for compatibility (`ways_of_working §6`, additive-only): it collapses `unknown`
 * and `not-configured` to `null`. Prefer {@link describeChatState} when the difference
 * matters — which is any time you would render "connect a key", because doing that in
 * the `unknown` state is exactly the false banner R3-300 fixes.
 */
declare const describeChat: () => ChatProviderInfo | null;
/** The four-state read: `unknown` before the host answers; then the host's `ungranted`
 *  mark, or the provider (configured / not-configured). */
declare const describeChatState: () => ChatProviderState;
/** Subscribe to provider changes (key added/revoked, preference changed). Invoked
 *  immediately with the current value, then on every change. Returns unsubscribe. */
declare const onChatProviderChange: (listener: (provider: ChatProviderInfo | null) => void) => (() => void);
/** Subscribe to the provider-state description. */
declare const onChatProviderStateChange: (listener: (state: ChatProviderState) => void) => (() => void);
/** React hook returning the resolved chat provider (or `null`), re-rendering on
 *  change — gate the summarize affordance on `provider !== null`. */
declare const useChatProvider: () => ChatProviderInfo | null;
/**
 * React hook returning the four-state description.
 *
 * Use this to render provider state honestly: show nothing (or a neutral placeholder)
 * while `unknown`, the connect affordance only on `not-configured`, the NOT-GRANTED
 * cause — never the connect copy — on `ungranted`, and the provider's name on
 * `configured`.
 */
declare const useChatProviderState: () => ChatProviderState;

export { type ChatDelta, type ChatExecutor, type ChatFeatures, type ChatMessage, type ChatModelInfo, type ChatProviderChoice, type ChatProviderInfo, type ChatProviderState, type ChatRequest, type ChatResult, type ChatRole, type ChatStopReason, type ChatTierModels, type ContentPart, type EmbedRequest, type EmbedResult, type KindModelInfo, type ToolDef, chat, deriveChatProviderState, describeChat, describeChatState, embed, normalizeProviderInfo, onChatProviderChange, onChatProviderStateChange, useChatProvider, useChatProviderState };
