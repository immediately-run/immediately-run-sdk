// feedFetch — the connector's egress, and the difference between it and `hostFetch`
// is the whole of D2 (`reckoner/docs/specs/CONNECTOR_EGRESS_FIXING_SPEC.md` §2).
//
// `hostFetch(url, init)` takes a URL. The host checks it against your effective
// allowlist, but *within* that allowlist your app picks which host, which path and
// what body, on every call. That is fine for an app whose logic you control.
//
// It is not fine for a **connector** — an app whose job is to pump bytes from a feed
// into a document, where the bytes it fetched are, in effect, a program steering it
// (`REPORTING_SPREADSHEET §3.2` RB-1). An allowlist bounds the host *set*; it does
// nothing about per-call choice inside that set, and nothing at all about the body.
//
// So `feedFetch` does not take a URL. It takes a **feed-instance id** and a typed
// **param object**, and the host constructs the request from a template it compiled,
// at grant time, from your app's trusted feed configuration. Your code cannot name a
// target, so content your code just read cannot name one either.
//
// What that means in practice when you write a connector:
//
//   • the origin, path and method come from your manifest's `feed:fetch` config —
//     not from this call, and not from anything you fetched;
//   • `params` fill only the slots the template declared, and each is typed
//     (an ISO-8601 instant, a bounded integer, or one of a declared enum). A value
//     that is not what the slot declared is rejected — including, incidentally,
//     anything URL-shaped;
//   • **pagination is not yours.** The host mints the cursor, keeps it, and spends it;
//     you neither supply nor receive one. A cursor you round-tripped would be either
//     bytes you authored or a function of bytes you fetched, and both are exactly what
//     this surface exists to prevent;
//   • a `POST`/body feed's body comes from the template too. There is no parameter
//     that carries body bytes.
//
// Hold `feed:fetch` **instead of** `net:fetch`, not alongside it. An app holding
// `net:fetch` has the URL surface back regardless of any template it was also given,
// which is why they are two capabilities and not one with a flag.

import { protocolRequest } from './sandboxUtils';
import { SCHEMES } from './protocolSchemes';
import { PROTOCOL_FEED } from './generated/protocol';

/** Values a feed template's declared slots accept. The host validates each against
 *  the slot's declared type; anything else is `invalid-params`. */
export type FeedParams = Record<string, string | number>;

/** The serialized response from {@link feedFetch} — the same shape `hostFetch`
 *  returns, because reading a feed should feel like reading a fetch. The difference
 *  is entirely in what you may ASK for. */
export interface FeedFetchResponse {
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
// The parameter is spelled structurally rather than as `FeedParams`, deliberately: the
// wire descriptor in `@immediately-run/sandbox-protocol` records the type that actually
// crosses the boundary, and an SDK-local alias name in a CROSS-REPO wire contract would
// describe this package rather than the protocol. `FeedParams` stays exported as the
// name callers write.
export const feedFetch = async (
  instanceId: string,
  params: Record<string, string | number> = {},
): Promise<FeedFetchResponse> => {
  const res = (await protocolRequest(SCHEMES[PROTOCOL_FEED], 'fetch', [{ instanceId, params }])) as
    | { ok: true; data: FeedFetchResponse }
    | { ok: false; code?: string; message?: string }
    | undefined;
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? 'feedFetch failed') as Error & { code?: string };
    err.code = (res && 'code' in res ? res.code : undefined) ?? 'unknown';
    throw err;
  }
  return res.data;
};
