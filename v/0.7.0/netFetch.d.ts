interface HostFetchInit {
    method?: string;
    headers?: Record<string, string>;
    /** Request body for non-GET/HEAD methods (string). */
    body?: string;
}
interface HostFetchResponse {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
    /** True if the body hit the host's size cap and was truncated. */
    truncated: boolean;
}
/**
 * Fetch through the host's parent-fetch proxy (§5.11). Requires the `net:fetch`
 * capability with `url`'s origin in your effective allowlist (manifest ∩ the
 * user's consent) — both are arranged at load via the consent screen.
 *
 * A reachable server's reply (including a non-2xx status) RESOLVES — inspect
 * `.status`. A gate/SSRF/transport failure REJECTS with an {@link Error} carrying
 * a machine `.code`: `forbidden` (outside the allowlist), `blocked` (SSRF target),
 * `invalid` (bad url/scheme), `redirect` (the host refuses to follow redirects),
 * `too-large`, or `network`.
 */
declare const hostFetch: (url: string, init?: HostFetchInit) => Promise<HostFetchResponse>;
/** One streamed slice of the response body (a chunk as it arrives from the
 *  host). Concatenate `.chunk` across the stream to rebuild the body. */
interface HostFetchStreamEvent {
    chunk: string;
}
/** The terminal value of a {@link hostFetchStream} run — the response metadata,
 *  delivered once after the last body chunk. There is no `body` field: the body
 *  arrived as the stream of {@link HostFetchStreamEvent}s. */
interface HostFetchStreamResult {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    /** True if the stream hit the host's cumulative byte cap and was truncated. */
    truncated: boolean;
    /** Total decoded body bytes delivered. */
    bytes: number;
}
/**
 * Stream a response through the host's parent-fetch proxy (§5.11 streaming;
 * `LLM_AND_AGENTS_SPEC §2.2`) — the streaming counterpart of {@link hostFetch},
 * for SSE / LLM token streaming. Same `net:fetch` gate (manifest ∩ consent),
 * same credential-less rule and per-hop SSRF re-check; the response body is
 * pumped as a sequence of {@link HostFetchStreamEvent} chunks instead of a single
 * buffered reply.
 *
 * ```ts
 * let body = '';
 * for await (const { chunk } of hostFetchStream(url, { method: 'POST', body })) {
 *   body += chunk;            // e.g. parse SSE / token deltas as they arrive
 * }
 * ```
 *
 * The generator **returns** a {@link HostFetchStreamResult} (status + headers +
 * `truncated`/`bytes`) when the body completes. A gate/SSRF/transport failure —
 * or one of the host's stream bounds — **throws** a `StreamError` (from
 * `./protocolStream`) carrying a
 * machine `.code`: `forbidden` (outside the allowlist), `blocked` (SSRF target),
 * `invalid` (bad url/scheme), `redirect` (the host refuses to follow redirects),
 * `idle-timeout` / `total-timeout` (the host's stream bounds), `byte-cap`, or
 * `network`. The stream is bounded by the host's idle/total timeouts and a
 * cumulative byte cap, so it cannot be used as an unbounded transfer channel.
 *
 * Requires the host to implement the `protocol-fetch` streaming emitter; until
 * that lands a streaming request fails with `not-streamable` and callers should
 * fall back to {@link hostFetch} (`LLM_AND_AGENTS_SPEC §2.2`, roadmap P3-71).
 */
declare function hostFetchStream(url: string, init?: HostFetchInit): AsyncGenerator<HostFetchStreamEvent, HostFetchStreamResult, void>;

export { type HostFetchInit, type HostFetchResponse, type HostFetchStreamEvent, type HostFetchStreamResult, hostFetch, hostFetchStream };
