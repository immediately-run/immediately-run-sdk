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

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

/** A part of a message. `image` is only honored when the resolved provider
 *  advertises `features.vision` (§2.5) — branch on {@link describeChat} first. */
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mimeType: string; data: string }; // data: base64, no data: URL prefix

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
}

/** One streamed chunk. Consumers typically accumulate `text-delta`s. */
export type ChatDelta =
  | { type: 'text-delta'; text: string }
  | { type: 'tool-call'; id: string; name: string; input: unknown }
  | { type: 'usage'; inputTokens: number; outputTokens: number };

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
  return invokeStream<ChatDelta, ChatResult>('llm:chat', req as unknown as Record<string, unknown>);
}

/** The resolved provider's advertised abilities (SERVICE_PROVIDERS_SPEC §2.5) — read
 *  to branch/degrade (offer image upload only when `vision`). */
export interface ChatFeatures {
  vision: boolean;
  tools: boolean;
  jsonMode: boolean;
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
}

// The `llm-provider` describe channel (Recipe A): the host pushes the resolved
// provider info on change and replays it on register-frame, gated by `llm:chat`.
// A message with no `provider` key is ignored; an explicit `null` means "no provider
// bound" (distinct from "not yet answered", which keeps the `initial` null).
const channel = createPushChannel<ChatProviderInfo | null>({
  pushType: 'llm-provider',
  requestType: 'request-llm-provider',
  initial: null,
  parse: (msg) =>
    'provider' in msg ? (msg.provider as ChatProviderInfo | null) : undefined,
});

/** The provider the host resolved for this app (or `null` if none bound). Poll for a
 *  one-off read; use {@link onChatProviderChange}/{@link useChatProvider} to react. */
export const describeChat = (): ChatProviderInfo | null => channel.get();

/** Subscribe to provider changes (key added/revoked, preference changed). Invoked
 *  immediately with the current value, then on every change. Returns unsubscribe. */
export const onChatProviderChange = (
  listener: (provider: ChatProviderInfo | null) => void,
): (() => void) => channel.onChange(listener);

/** React hook returning the resolved chat provider (or `null`), re-rendering on
 *  change — gate the summarize affordance on `provider !== null`. */
export const useChatProvider = (): ChatProviderInfo | null => channel.use();
