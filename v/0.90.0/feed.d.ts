/** Values a feed template's declared slots accept. The host validates each against
 *  the slot's declared type; anything else is `invalid-params`. */
type FeedParams = Record<string, string | number>;
/** The serialized response from {@link feedFetch} — the same shape `hostFetch`
 *  returns, because reading a feed should feel like reading a fetch. The difference
 *  is entirely in what you may ASK for. */
interface FeedFetchResponse {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
    /** True if the body hit the host's size cap and was truncated. */
    truncated: boolean;
}
/**
 * Fire one of your app's configured feeds through the host.
 *
 * ```ts
 * // `instanceId` comes from the host when the feed is launched — it is opaque,
 * // host-minted, and bound to your app; you never construct one.
 * const res = await feedFetch(instanceId, { since: '2026-08-01T00:00:00Z' });
 * const rows = JSON.parse(res.body);
 * ```
 *
 * A reachable server's reply — including a non-2xx status — RESOLVES; inspect
 * `.status`. Everything else REJECTS with an {@link Error} carrying a machine `.code`:
 *
 * - `forbidden` — you do not hold `feed:fetch`, or `instanceId` is not one of yours.
 *   **The two are deliberately indistinguishable**, so this is not an oracle for which
 *   feeds exist.
 * - `invalid-params` — a param the template does not declare, a value that is not what
 *   its slot declared, or a body that would exceed the template's cap. Naming a cursor
 *   slot lands here too: the cursor is the host's, not a parameter.
 * - `budget` — this instance's request budget is spent. It bounds runaway loops; it is
 *   a tripwire, not containment.
 * - `unsupported` — the host's pinned egress path is unavailable. `feedFetch`
 *   deliberately has **no fallback**: the alternative path does no DNS resolution and no
 *   socket pinning, and silently downgrading a credentialed feed onto it is the hazard
 *   this whole mechanism removes. A connector that cannot use the pinned path does not
 *   fetch.
 * - `blocked` / `redirect` / `too-large` / `network` — the same server-side SSRF,
 *   per-hop redirect and size guards every proxied fetch meets.
 */
declare const feedFetch: (instanceId: string, params?: Record<string, string | number>) => Promise<FeedFetchResponse>;

export { type FeedFetchResponse, type FeedParams, feedFetch };
