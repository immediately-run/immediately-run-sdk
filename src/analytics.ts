// App analytics — the app-facing surface for `analytics:emit`
// (APP_ANALYTICS_SPEC §2/§3/§5, roadmap R3-350).
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS IS FOR, STATED HONESTLY
// ─────────────────────────────────────────────────────────────────────────────
//
// An app runs in an opaque-origin sandboxed iframe where even touching
// `localStorage` throws. It has no storage and no identity of its own, so **a
// publisher has no way to learn how their app is used.**
//
// The honest argument for this capability is *not* that it displaces `net:fetch` —
// it does not displace anything, and nothing here narrows or discourages
// `net:fetch`. The argument is a **comparison of bargains**: publishers have a real
// need; absent a fitted capability they will request `net:fetch` to satisfy it; and
// a `net:fetch` grant obtained for analytics is a worse bargain for the user than an
// analytics grant — broader reach, arbitrary bodies, and a consent line that says
// "network access" rather than "usage statistics". An app holding BOTH is displayed
// as such at consent, because the analytics grant then bounds nothing.
//
// ─────────────────────────────────────────────────────────────────────────────
// WRITE-ONLY. THERE IS NO READ METHOD HERE, AND NONE IS COMING.
// ─────────────────────────────────────────────────────────────────────────────
//
// T-AN-6. An app that could read its own aggregates would learn about the USER —
// which is the party the architecture assumes is being protected from unaccountable
// publishers. §13 records the read path as rejected: *"a plausible feature that
// converts a write-only channel into a two-way one, and would need its own threat
// pass."* The wire family declares no push channel and no poll, so there is nothing
// for a read method to ride on.
//
// The reply is a bare acknowledgement. It carries no count, no remaining budget, and
// no "was that route recognised" — each of those would be a read channel by another
// name, and an app that could probe which paths are accepted has one.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT YOU MUST DECLARE, AND WHY IT IS THE SHAPE IT IS
// ─────────────────────────────────────────────────────────────────────────────
//
// Everything an app may emit is declared in its manifest and consented to by the
// user. **The hash of that declaration is bound into the grant** (§2.1): change the
// vocabulary and the grant is invalid until the user re-consents with the new one
// shown. `appKey` carries no ref, so without that binding a publisher could observe
// their aggregates and then ship an alphabet tuned to encode what they now want to
// read, under a grant given for something else.
//
//   "capabilities": [{
//     "name": "analytics:emit",
//     "params": {
//       "events": {
//         "clinic.view":   { "props": { "tab": { "type": "enum", "values": ["summary", "meds"] } } },
//         "clinic.export": { "props": { "format": { "type": "enum", "values": ["pdf", "csv"] } } }
//       },
//       "routes": ["/patients/:id", "/patients"]
//     }
//   }]
//
// - **String properties must be bounded ENUMERATIONS**, never free strings; numeric
//   ones declare an INTEGRAL range. This is the difference between a bound that is
//   computed and one that is hoped for: analytics is a covert channel with a
//   capacity, and a free string carries the file, the key, the row. It will be the
//   first thing you want relaxed; §12 says so in advance.
// - **The total declared vocabulary is capped** at 2^12 distinct emit-shapes. Eight
//   properties of sixteen values each looks modest written out and is 4.3 billion.
// - **Routes are patterns, never paths.** `/patients/12345` is not a page name. You
//   pass the concrete path to {@link recordRoute} and the platform records
//   `/patients/:id`; the variable segment is discarded at the boundary and never
//   transmitted. If you need per-item counts, declare a bounded enumeration of
//   items — there is no unbounded per-item cardinality by design.
// - **There is a per-user daily cap**, published in the consent line's detail.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHEN THIS WILL REFUSE
// ─────────────────────────────────────────────────────────────────────────────
//
// Every refusal is a typed error, and none of them is retryable by trying harder:
//
// - `forbidden` — no grant; or the grant is bound to a DIFFERENT vocabulary than the
//   one currently declared (re-consent needed); or the app is running under the M3
//   stranger stance, which refuses `analytics:*` outright; or the caller is a task
//   app invoked by a holder — the capability is not delegable.
// - `invalid-params` — the event is not in the declared vocabulary: an undeclared
//   name or key, a string outside its enumeration, a number outside its range.
//   Rejected, never silently stripped.
// - `budget` — the per-(app, user) daily cap is spent.
//
// **Emits never throw into your app by default.** {@link track} swallows refusals,
// because an analytics call failing is not a reason for a feature to fail. Use
// {@link emitAnalyticsEvent} when you want the error.

import { protocolRequest } from './sandboxUtils';
import { SCHEMES } from './protocolSchemes';
import { PROTOCOL_ANALYTICS } from './generated/protocol';

/** Property values a declared event may carry. Scalars only — an object or an array
 *  has no bound, and the bound is the point. */
export type AnalyticsPropValue = string | number | boolean;

/** The acknowledgement. Deliberately carries nothing but the fact of acceptance —
 *  anything else would be a read channel back into the app (T-AN-6). */
export interface AnalyticsAck {
  accepted: boolean;
}

/**
 * Emit one declared analytics event, surfacing refusals as typed errors.
 *
 * @param name a declared, app-namespaced event name (`myapp.somethingHappened`).
 *             It may not collide with the host vocabulary.
 * @param props declared properties only. An undeclared key REJECTS the event —
 *              nothing is stripped, because a silently dropped key turns a leak into
 *              a green test.
 *
 * @throws `forbidden` | `invalid-params` | `budget` — see the module header.
 */
export const emitAnalyticsEvent = (name: string, props?: Record<string, AnalyticsPropValue>): Promise<AnalyticsAck> =>
  protocolRequest(SCHEMES[PROTOCOL_ANALYTICS], 'emit', [{ name, ...(props ? { props } : {}) }]);

/**
 * Record a navigation, as a declared route PATTERN.
 *
 * Pass the concrete path your router produced. The platform matches it against your
 * declared patterns and records the **pattern**: `/patients/12345` becomes
 * `/patients/:id`, and the id is discarded at the boundary rather than filtered
 * later. A path matching no declared pattern records nothing — and reports success
 * either way, because telling you which paths are accepted would be a read channel.
 *
 * @throws the same typed errors as {@link emitAnalyticsEvent}.
 */
export const recordRoute = (path: string): Promise<AnalyticsAck> =>
  protocolRequest(SCHEMES[PROTOCOL_ANALYTICS], 'route', [{ path }]);

/**
 * Fire-and-forget {@link emitAnalyticsEvent}.
 *
 * Swallows every refusal, because an analytics call failing is not a reason for a
 * feature to fail — and because the alternative is every call site wrapping this in
 * a `try` that does nothing, which is the same behaviour with more places to get it
 * wrong. Use {@link emitAnalyticsEvent} while you are getting your vocabulary right;
 * use this in the code you ship.
 */
export const track = (name: string, props?: Record<string, AnalyticsPropValue>): void => {
  void emitAnalyticsEvent(name, props).catch(() => {});
};

/** Fire-and-forget {@link recordRoute}, on the same reasoning as {@link track}. */
export const trackRoute = (path: string): void => {
  void recordRoute(path).catch(() => {});
};
