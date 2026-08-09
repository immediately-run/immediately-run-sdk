// The method catalog (UI_AS_APPS_SPEC §5.5) — the app's own grant-filtered RPC
// surface, and a generic way to call it. The host advertises exactly the methods
// this app may invoke (MCP-tool-shaped); `invoke()` calls one by its catalog name.
// Handing the catalog to an embedded agent as its tool list confines the agent to
// the app's authority (agent sandboxing falls out of the capability model, §5.9).
import { protocolRequest, sendMessage, addListener } from './sandboxUtils';
import type { StreamFrame, StreamTransport } from './protocolStream';
import { consumeStream } from './protocolStream';
import { createPushChannel } from './pushChannel';

/** One advertised method, as the host generated it from its gate table. */
export interface ApiMethod {
  /** Catalog name, `protocol-` stripped — e.g. `spaces:invite`, `contribute:run`. */
  name: string;
  /** The capability this method requires (already held — it's in your catalog). */
  capability: string;
  /** True when the method STREAMS (use {@link invokeStream}) vs. single-reply. */
  stream?: boolean;
  /**
   * JSON Schema for the method's single object argument, when the host declares one.
   * Self-describes the call so a catalog-as-tools bridge (an embedded agent) can
   * advertise the real param shape — e.g. that `authoring:typecheck` takes a nested
   * `{ files: [{ path, content }] }` array — instead of a permissive "any object".
   * Absent for methods the host advertises without a schema.
   */
  paramsSchema?: Record<string, unknown>;
}

// `scheme:method` → ['scheme', 'method'] (the wire protocol is `protocol-scheme`).
const split = (name: string): [string, string] => {
  const i = name.indexOf(':');
  if (i <= 0) throw new Error(`invalid catalog method name: ${name}`);
  return [name.slice(0, i), name.slice(i + 1)];
};

/**
 * Call a catalog method by name — `invoke('spaces:invite', { spaceId, login, role })`.
 * A thin generic over the host protocol: the host validates params and gates the
 * call (an un-granted method → `forbidden`, even if you name it directly). For a
 * STREAMING method (`ApiMethod.stream`), use {@link invokeStream}.
 */
export const invoke = async <T = unknown>(
  name: string,
  params: Record<string, unknown> = {},
): Promise<T> => {
  const [scheme, method] = split(name);
  // The host replies with an `{ ok, data } | { ok:false, code }` envelope; unwrap
  // it and THROW on refusal (a `.code` like `forbidden` for an off-catalog call)
  // so callers — and any agent driving `invoke` — see the gate's verdict.
  const res = (await protocolRequest(scheme, method, [params])) as
    | { ok: true; data: unknown }
    | { ok: false; code?: string; message?: string }
    | undefined;
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? `${name} failed`) as Error & { code?: string };
    err.code = res?.code ?? 'unknown';
    throw err;
  }
  return res.data as T;
};

// Stream transport over the resolver (SDK_PACKAGING_SPEC §4) — sendMessage /
// addListener route through `transport()` (injected bundler messageBus or the §4
// global), never `bundler.messageBus` directly.
const streamTransport: StreamTransport = {
  send: (msg) => sendMessage(msg.type, msg as unknown as Record<string, unknown>),
  subscribe: (type, handler) =>
    addListener(type, (msg) => handler(msg as { msgId?: number; stream?: StreamFrame })),
  // Early-cancel: route a `{type, msgId, cancel:true}` frame back to the host so it
  // aborts the in-flight generation (and, for `llm:chat`, stops billing) — §3.3.
  cancel: (msg) => sendMessage(msg.type, msg as unknown as Record<string, unknown>),
};

/** Call a STREAMING catalog method by name, yielding its events. Pass `signal` to
 *  abort mid-stream: the host stops generating and (for `llm:chat`) stops billing. */
export function invokeStream<T = unknown, R = unknown>(
  name: string,
  params: Record<string, unknown> = {},
  signal?: AbortSignal,
): AsyncGenerator<T, R, void> {
  const [scheme, method] = split(name);
  return consumeStream<T, R>(streamTransport, `protocol-${scheme}`, method, [params], undefined, signal);
}

// The catalog list is read over the transport (§4): the host pushes `api-catalog`
// and answers `request-api-catalog` with this app's grant-filtered methods (wire
// format: site-main channelBridge.ts).
const channel = createPushChannel<ApiMethod[]>({
  pushType: 'api-catalog',
  requestType: 'request-api-catalog',
  initial: [],
  parse: (msg) => (Array.isArray(msg.methods) ? (msg.methods as ApiMethod[]) : undefined),
});

/** The methods this app may call (grant-filtered, §5.5). Poll for a one-off read;
 *  use {@link onCatalogChange} / {@link useCatalog} to react. */
export const getCatalog = (): ApiMethod[] => channel.get();

/** Subscribe to catalog changes (e.g. a grant added/revoked). Invoked immediately
 *  with the current catalog, then on every change. Returns an unsubscribe fn. */
export const onCatalogChange = (listener: (catalog: ApiMethod[]) => void): (() => void) =>
  channel.onChange(listener);

/** React hook returning this app's method catalog, re-rendering on change. Hand
 *  it to an embedded agent as its tool list to confine the agent to the app's
 *  authority (§5.9). */
export const useCatalog = (): ApiMethod[] => channel.use();
