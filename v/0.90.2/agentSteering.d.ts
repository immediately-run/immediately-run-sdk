/** How a steer applies. */
type SteerMode = 
/** Apply at the next turn boundary — the in-flight turn finishes first. */
'queue'
/** Abort the in-flight model turn now, then apply. Never interrupts a tool call. */
 | 'interrupt';
interface SteerMessage {
    id: string;
    text: string;
    mode: SteerMode;
}
/** Prefix marking a `user` message as a STEER rather than something typed at the
 *  start of a run — so a replayed conversation shows the interruption where it
 *  happened, instead of reconstructing a history that never ran (scope 5). Mirrors
 *  `COMPACTION_MARKER`/`NUDGE_TEXT`, which the transcript renderer already keys on. */
declare const STEER_MARKER = "\u241F[steer]\n";
/** As above, for a steer that ABORTED an in-flight turn. */
declare const STEER_INTERRUPT_MARKER = "\u241F[steer:interrupt]\n";
/** Text recorded in place of the assistant turn a steer cut short. The turn has to
 *  appear in the transcript — dropping it would put two `user` messages back to back
 *  and lose the fact that the model was mid-sentence when the user cut in. */
declare const INTERRUPTED_TURN_TEXT = "(turn interrupted by the user)";
/** Wrap a steer's text for the wire. */
declare const steerWireText: (m: SteerMessage) => string;
/** Recognise a steer on replay; returns the mode + text, or `null`. */
declare function parseSteer(text: string): {
    mode: SteerMode;
    text: string;
} | null;
/** What the loop needs from a steering source (so it can be faked in tests). */
interface SteerSource {
    /** Remove and return everything pending, in arrival order. */
    drain(): SteerMessage[];
    /** Is anything waiting? Checked before the loop would otherwise END, so a
     *  follow-up queued against a finishing run continues it instead. */
    hasPending(): boolean;
    /** Fires when an `interrupt`-mode steer arrives. The loop composes it with the
     *  stop signal for the in-flight model call. */
    readonly interrupt: AbortSignal;
    /** Called by the loop once an interrupt has been consumed, so the next turn is
     *  not aborted by a stale signal. */
    rearm(): void;
}
/**
 * The live steering queue. Owned by the UI (which enqueues and cancels) and read
 * by the loop (which drains at a turn boundary).
 */
declare class SteerController implements SteerSource {
    private queue;
    private controller;
    private listeners;
    /** Queue a correction. Returns its id so the UI can cancel it while it waits. */
    enqueue(text: string, mode?: SteerMode): SteerMessage | null;
    /** Drop a queued steer that has not been applied yet. */
    cancel(id: string): boolean;
    /** Everything still waiting, for the UI's "queued" affordance. */
    pending(): readonly SteerMessage[];
    hasPending(): boolean;
    drain(): SteerMessage[];
    get interrupt(): AbortSignal;
    rearm(): void;
    /** Subscribe to queue changes (the UI re-renders its queued chips). */
    onChange(listener: (pending: readonly SteerMessage[]) => void): () => void;
    private emit;
}
/**
 * Combine abort signals into one that fires when any of them does.
 *
 * `AbortSignal.any` exists in modern engines but not everywhere the sandbox runs,
 * and a silent `undefined` here would mean the stop button quietly stops working —
 * so this is explicit, and returns a disposer the caller uses to drop its listeners
 * (a per-turn signal that stayed subscribed to a run-long controller would leak one
 * listener per turn on a long run).
 */
declare function anySignal(signals: Array<AbortSignal | undefined>): {
    signal: AbortSignal;
    dispose: () => void;
};

export { INTERRUPTED_TURN_TEXT, STEER_INTERRUPT_MARKER, STEER_MARKER, SteerController, type SteerMessage, type SteerMode, type SteerSource, anySignal, parseSteer, steerWireText };
