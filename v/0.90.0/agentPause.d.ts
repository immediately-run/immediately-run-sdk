/** What the loop needs from a pause source (so it can be faked in tests). */
interface PauseSource {
    /** Is the run currently not allowed to advance? Read at each turn boundary. */
    isPaused(): boolean;
    /**
     * Resolves when the pause lifts — or immediately if it is already lifted.
     *
     * `signal` is the RUN's stop signal, and passing it is not optional in practice: a run
     * stopped (or signed out) while its region is hidden would otherwise await a resume
     * that never comes, and the awaited promise would keep the whole loop — transcript,
     * tools, client — alive for the life of the tab. Resolving on abort hands control back
     * to the loop, which re-checks `signal.aborted` and breaks.
     */
    whenResumed(signal?: AbortSignal): Promise<void>;
}
/**
 * The live pause state. Owned by the app (which sets it from the host's
 * `onRegionVisibilityChange`) and read by the loop.
 *
 * Deliberately NOT wired to the visibility channel in here: the controller is the
 * mechanism and knows nothing about why a run is paused, which keeps it usable for a
 * second reason later (a phone backgrounding, a user "hold" button) without this file
 * having an opinion about which reasons exist.
 */
declare class PauseController implements PauseSource {
    private paused;
    private waiters;
    private listeners;
    /** Set the pause state. Idempotent — setting the value it already holds does nothing. */
    set(paused: boolean): void;
    isPaused(): boolean;
    whenResumed(signal?: AbortSignal): Promise<void>;
    /** Subscribe to pause changes (a UI showing "paused — this view is hidden"). */
    onChange(listener: (paused: boolean) => void): () => void;
}

export { PauseController, type PauseSource };
