/**
 * Each `ir.*` marker name → the attribute keys its payload may carry (the §3
 * table). A forwarded marker is accepted only if BOTH its name is defined here AND
 * every attribute key it carries is in that marker's allowed set (LP-5). An empty
 * array means "no attributes" (a bare mark).
 */
declare const IR_MARKERS: {
    readonly "ir.open": readonly ["url", "provider", "ns", "repo", "ref", "refKind"];
    readonly "ir.fetch": readonly ["source", "bytes", "requestCount", "cacheHit", "httpStatus"];
    readonly "ir.mount": readonly ["phantomCount", "writablePrimed"];
    readonly "ir.sandbox.boot": readonly [];
    readonly "ir.transpile": readonly ["moduleCount", "cacheHit", "bytesIn", "bytesOut"];
    readonly "ir.deps": readonly ["depCount", "bytes", "requestCount", "cacheHit", "cdn"];
    readonly "ir.eval": readonly ["moduleCount"];
    readonly "ir.fmp": readonly [];
    readonly "ir.interactive": readonly ["cold"];
    readonly "ir.verify": readonly ["result", "blocking"];
    readonly "ir.refresh": readonly ["bytes"];
};
/** A canonical `ir.*` load-profiling marker name (a key of {@link IR_MARKERS}). */
type IrMarkerName = keyof typeof IR_MARKERS;
/** Is `name` a defined top-level `ir.*` marker (not a sub-mark)? */
declare const isIrMarkerName: (name: string) => name is IrMarkerName;
/** Is `name` an accepted marker name — a defined top-level marker OR a recognized
 *  per-module/per-dep sub-mark? */
declare const isAllowedMarkerName: (name: string) => boolean;
/** A marker forwarded across the origin boundary (§3.2): a name, the sandbox-side
 *  `performance.now()` timestamp, and the optional attribute payload. */
interface ForwardedMarker {
    name: string;
    /** Sandbox-relative timestamp (`performance.now()`) at emission (§3.2). */
    at: number;
    attrs?: Record<string, unknown>;
}
/**
 * The LP-5 vocabulary allowlist (pure). Accept a forwarded marker ONLY if its name
 * is in the vocabulary AND every attribute key is in that marker's schema. An
 * unknown name — or a defined name carrying an out-of-schema attribute key — is
 * DROPPED (returns `null`), never recorded. This is the gate against an untrusted
 * sandbox minting arbitrary names/values into the host timeline (an injection
 * surface for dashboards / the deferred RUM endpoint). Sub-marks inherit their
 * aggregate's schema.
 */
declare function validateMarker(m: ForwardedMarker | null | undefined): ForwardedMarker | null;
/**
 * `ir.interactive = max(rootRenderCommit, reportReady)` (LP2-3). An app-called
 * `reportReady()` may only DELAY interactive — never advance it before the root
 * render commits. A `reportReady()` that fires early is recorded but takes effect
 * at the commit; if the app never reports, the commit alone stands. Budgets bind to
 * the later of the two, so an app can't game its budget by declaring itself ready
 * before it has rendered anything. PURE.
 */
declare function resolveInteractive(rootRenderCommitAt: number, reportReadyAt?: number): number;

export { type ForwardedMarker, IR_MARKERS, type IrMarkerName, isAllowedMarkerName, isIrMarkerName, resolveInteractive, validateMarker };
