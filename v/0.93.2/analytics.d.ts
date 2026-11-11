/** Property values a declared event may carry. Scalars only — an object or an array
 *  has no bound, and the bound is the point. */
type AnalyticsPropValue = string | number | boolean;
/** The acknowledgement. Deliberately carries nothing but the fact of acceptance —
 *  anything else would be a read channel back into the app (T-AN-6). */
interface AnalyticsAck {
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
declare const emitAnalyticsEvent: (name: string, props?: Record<string, AnalyticsPropValue>) => Promise<AnalyticsAck>;
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
declare const recordRoute: (path: string) => Promise<AnalyticsAck>;
/**
 * Fire-and-forget {@link emitAnalyticsEvent}.
 *
 * Swallows every refusal, because an analytics call failing is not a reason for a
 * feature to fail — and because the alternative is every call site wrapping this in
 * a `try` that does nothing, which is the same behaviour with more places to get it
 * wrong. Use {@link emitAnalyticsEvent} while you are getting your vocabulary right;
 * use this in the code you ship.
 */
declare const track: (name: string, props?: Record<string, AnalyticsPropValue>) => void;
/** Fire-and-forget {@link recordRoute}, on the same reasoning as {@link track}. */
declare const trackRoute: (path: string) => void;

export { type AnalyticsAck, type AnalyticsPropValue, emitAnalyticsEvent, recordRoute, track, trackRoute };
