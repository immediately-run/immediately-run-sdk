interface ReadyState {
    /** Whether the app has called `reportReady()`. */
    reported: boolean;
    /** The app-reported timestamp (`performance.now()`), if it has reported. */
    reportedAt?: number;
}
interface ReadyDeps {
    send: (type: string, data?: Record<string, unknown>) => void;
    now: () => number;
}
/**
 * Signal that the app is usefully interactive (e.g. after an initial data load).
 * IDEMPOTENT — only the FIRST call counts; later calls are ignored. Forwards the
 * report to the runtime (`ir-report-ready`) so the host can resolve
 * `ir.interactive = max(rootRenderCommit, reportedAt)` (LP2-3) — calling it before
 * the root render commits can only delay the signal, never advance it.
 */
declare function reportReady(): void;
/** Pollable snapshot of the report state. */
declare function getReadyState(): ReadyState;
/**
 * Subscribe to the ready signal. Invoked immediately with the current state (so a
 * late subscriber after `reportReady()` still fires) and again whenever it reports.
 * Returns an unsubscribe.
 */
declare function onReady(listener: (s: ReadyState) => void): () => void;
/** Test seam: override the transport/clock. */
declare function __setReadyDeps(d: Partial<ReadyDeps>): void;
/** Test seam: reset module state between cases. */
declare function __resetReady(): void;

export { type ReadyState, __resetReady, __setReadyDeps, getReadyState, onReady, reportReady };
