// Provider-agnostic LLM chat — the `llm.chat@1` slot (SERVICE_PROVIDERS_SPEC;
// LLM_AND_AGENTS_SPEC §8 D5).
//
// An app calls ONE chat slot and never worries about which provider the user has a
// key for: the HOST resolves which vendor answers from the key the user holds
// (`SecretView.boundOrigin`) plus their `preferredImplementation` choice, normalizes
// the wire format, injects the key host-side at the §6 net:fetch point (the
// look-at-nothing proxy), and streams normalized deltas back. The app never names a
// vendor, never sees the key, and needs NO `net:fetch`/`secrets` grant of its own —
// only the `llm:chat` capability (elevated, app-scoped: a fork earns it by consent).
//
// Inert until the host implements `protocol-llm` (the `chat` stream) + the
// `llm-provider` describe channel; the contract ships here so apps (the file-explorer
// summarize fork) can be written against it — exactly how `secrets.ts` shipped ahead
// of `protocol-secrets`.
import { invokeStream } from './catalog';
import { createPushChannel } from './pushChannel';
import { LLM_PROVIDER, REQUEST_LLM_PROVIDER } from './generated/protocol';

/** Who authored a {@link ChatMessage}. */
export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

/** A part of a message. `image` is only honored when the resolved provider
 *  advertises `features.vision` (§2.5); `tool-use`/`tool-result` only when it
 *  advertises `features.tools` — branch on {@link describeChat} first. */
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mimeType: string; data: string } // data: base64, no data: URL prefix
  // A tool call the model emitted on a prior `assistant` turn — replay it in the
  // conversation so a follow-up request carries the agentic history. Pairs with the
  // streamed `tool-call` {@link ChatDelta} that first surfaced it.
  | { type: 'tool-use'; id: string; name: string; input: Record<string, unknown> }
  // A block of the model's own REASONING from a prior `assistant` turn (R3-335).
  // Honored only when the resolved provider advertises `features.reasoning`.
  //
  // Echo these back. On some providers a reasoning block must be replayed — with its
  // `signature` intact and BEFORE the turn's text/tool-use — for the following turn to
  // be accepted at all; a loop that drops them is quietly lossy across turns in a way
  // that shows up as degraded output rather than an error. Pairs with the streamed
  // `reasoning` {@link ChatDelta}.
  | { type: 'reasoning'; text: string; signature?: string }
  // Reasoning the provider REDACTED: opaque bytes with no readable text, which still
  // have to be echoed back in place to keep the chain valid. Never render it.
  | { type: 'reasoning-redacted'; data: string }
  // The result of executing a `tool-use`, fed back so the model can continue. Carried
  // on a `user`/`tool`-role message; `toolCallId` matches the `tool-use` `id`.
  | { type: 'tool-result'; toolCallId: string; content: string; isError?: boolean };

/** One message in a {@link ChatRequest}: a role plus its content parts. */
export interface ChatMessage {
  role: ChatRole;
  content: ContentPart[];
}

/** A tool the model may call — honored only when `features.tools`. */
export interface ToolDef {
  name: string;
  description?: string;
  /** JSON-Schema for the tool's arguments. */
  inputSchema: Record<string, unknown>;
}

/** A host-brokered chat completion request: the messages plus optional tools,
 *  response format, and model hint (each honored per the provider's features). */
export interface ChatRequest {
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
export type ChatDelta =
  | { type: 'text-delta'; text: string }
  | { type: 'tool-call'; id: string; name: string; input: unknown }
  // R3-335 — the model's reasoning as it streams. `reasoning-delta` carries the text
  // incrementally (render it live); the terminal `reasoning` carries the WHOLE block
  // plus the `signature` the provider may require on the echo, and is what a caller
  // should put back into the conversation. A provider without reasoning emits neither.
  | { type: 'reasoning-delta'; text: string }
  | { type: 'reasoning'; text: string; signature?: string }
  | { type: 'reasoning-redacted'; data: string }
  // Token accounting for the turn. `cacheReadTokens`/`cacheWriteTokens` are present
  // only on providers that report prompt caching (R3-336) — they are what makes a
  // caching claim verifiable rather than believed, and their ABSENCE is meaningful:
  // it says this provider reports nothing, not that nothing was cached.
  | {
      type: 'usage';
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
    };

/** Why generation stopped: natural `end`, `length` cap, a `tool` call, or content `filtered`. */
export type ChatStopReason = 'end' | 'length' | 'tool' | 'filtered';

/** The terminal value of the {@link chat} stream. */
export interface ChatResult {
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
export function chat(req: ChatRequest): AsyncGenerator<ChatDelta, ChatResult, void> {
  // Peel `signal` out of the request before it becomes wire params — an AbortSignal
  // can't cross the postMessage boundary as data; it drives the SDK-side cancel frame.
  const { signal, ...params } = req;
  return invokeStream<ChatDelta, ChatResult>('llm:chat', params as unknown as Record<string, unknown>, signal);
}

/** The resolved provider's advertised abilities (SERVICE_PROVIDERS_SPEC §2.5) — read
 *  to branch/degrade (offer image upload only when `vision`). */
export interface ChatFeatures {
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
export interface ChatProviderInfo {
  /** Opaque provider id, e.g. `llm.chat.anthropic` — never a vendor secret or model id. */
  providerId: string;
  /** True for Host-proxied providers (host-vouched, SP-9); false for app-level ones,
   *  whose `features` are an untrusted claim. */
  hostVouched: boolean;
  features: ChatFeatures;
  // NOTE (R3-300): `displayName`, `executor` and the resolved per-tier `models` belong
  // here — an app rendering provider state wants all three. They are NOT added yet,
  // deliberately: this interface IS the `llm-provider` channel's declared value, so
  // adding a field is a WIRE change, and the wire is owned by
  // `@immediately-run/sandbox-protocol` (descriptor edit → publish → pin bump on both
  // sides). The protocol snapshot gate enforces exactly that, and it is right to. The
  // enrichment rides R3-307's publish, which already has to touch those descriptors —
  // one publish for two additions rather than two.
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
export type ChatProviderState =
  | { status: 'unknown' }
  | { status: 'not-configured' }
  | { status: 'configured'; provider: ChatProviderInfo };

// The `llm-provider` describe channel (Recipe A): the host pushes the resolved
// provider info on change and replays it on register-frame, gated by `llm:chat`.
// A message with no `provider` key is ignored; an explicit `null` means "no provider
// bound", which is now REPRESENTABLE as distinct from "not yet answered".
// The channel's VALUE stays exactly what the wire carries — `ChatProviderInfo | null` —
// because the wire did not change here and the protocol snapshot gate reads this type as
// the channel's shape. The three-state lives BESIDE it: `answered` records whether the host
// has ever spoken on this channel, which is the one bit `null` cannot carry. Deriving the
// state rather than widening the channel keeps the wire contract byte-identical, which it
// is (SDK_PACKAGING_SPEC §9: the wire is additive-only, and this is not a wire change).
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
export function normalizeProviderInfo(provider: ChatProviderInfo | null): ChatProviderInfo | null {
  if (!provider) return null;
  // The wire value is whatever the host sent, which may predate `reasoning` — so read
  // it as partial rather than trusting the declared type, and decide the flag explicitly.
  const wire = provider.features as Partial<ChatFeatures>;
  return { ...provider, features: { ...wire, reasoning: wire.reasoning === true } as ChatFeatures };
}

let answered = false;
const channel = createPushChannel<ChatProviderInfo | null>({
  pushType: LLM_PROVIDER,
  requestType: REQUEST_LLM_PROVIDER,
  initial: null,
  parse: (msg) => {
    if (!('provider' in msg)) return undefined;
    answered = true;
    return normalizeProviderInfo((msg.provider as ChatProviderInfo | null) ?? null);
  },
});

/** Derive the three-state from the wire value plus whether the host has answered. */
const stateOf = (provider: ChatProviderInfo | null): ChatProviderState =>
  !answered ? { status: 'unknown' } : provider ? { status: 'configured', provider } : { status: 'not-configured' };

/**
 * The provider the host resolved for this app, or `null`.
 *
 * Kept for compatibility (`ways_of_working §6`, additive-only): it collapses `unknown`
 * and `not-configured` to `null`. Prefer {@link describeChatState} when the difference
 * matters — which is any time you would render "connect a key", because doing that in
 * the `unknown` state is exactly the false banner R3-300 fixes.
 */
export const describeChat = (): ChatProviderInfo | null => channel.get();

/** The three-state read: `unknown` before the host answers, then configured or not. */
export const describeChatState = (): ChatProviderState => stateOf(channel.get());

/** Subscribe to provider changes (key added/revoked, preference changed). Invoked
 *  immediately with the current value, then on every change. Returns unsubscribe. */
export const onChatProviderChange = (listener: (provider: ChatProviderInfo | null) => void): (() => void) =>
  channel.onChange(listener);

/** Subscribe to the three-state provider description. */
export const onChatProviderStateChange = (listener: (state: ChatProviderState) => void): (() => void) =>
  channel.onChange((p) => listener(stateOf(p)));

/** React hook returning the resolved chat provider (or `null`), re-rendering on
 *  change — gate the summarize affordance on `provider !== null`. */
export const useChatProvider = (): ChatProviderInfo | null => channel.use();

/**
 * React hook returning the three-state description.
 *
 * Use this to render provider state honestly: show nothing (or a neutral placeholder)
 * while `unknown`, the connect affordance only on `not-configured`, and the provider's
 * name on `configured`.
 */
export const useChatProviderState = (): ChatProviderState => stateOf(channel.use());
