import { HostAttentionKind } from './hostAttention.js';

/** Whether a call may block on a human being asked something. */
type Attendance = 'unattended' | 'attended';
/** Milliseconds. Exported so callers can reason about the defaults they are overriding. */
declare const UNATTENDED_TIMEOUT_MS = 30000;
/** Network calls reach arbitrary upstreams; the host bounds the fetch itself, so this is a
 *  backstop against the host never replying, not a request budget. */
declare const NETWORK_TIMEOUT_MS = 120000;
/** Far beyond human reaction time — this exists only so an ABANDONED prompt releases the
 *  caller. It must never be short enough to abort someone who is deciding. */
declare const ATTENDED_TIMEOUT_MS = 600000;
/** A stream's first frame may be behind an unseal, so it gets an attended-scale bound of
 *  its own. See `firstFrameTimeoutFor`. */
declare const ATTENDED_FIRST_FRAME_MS = 300000;
/** After the first frame, silence this long means the stream is wedged: the host is no
 *  longer producing and no human is being asked. */
declare const STREAM_IDLE_TIMEOUT_MS = 120000;
/** When a call passes this, `onPending` fires so a caller can render a waiting state
 *  instead of an unexplained stall. */
declare const PENDING_NOTICE_MS = 3000;
/** Whether a call may block on a human. Exported for the classification test + tooling. */
declare function attendanceOf(scheme: string, method: string): Attendance;
/** Why a call is classified attended, or `undefined` when it is not. Exported so the
 *  classification is legible from a test failure rather than only from this source. */
declare function attendanceReason(scheme: string, method: string): string | undefined;
/** The default deadline for a one-shot `protocolRequest`. */
declare function timeoutFor(scheme: string, method: string): number;
/**
 * The default TIME-TO-FIRST-FRAME bound for a stream.
 *
 * Deliberately not a total-duration bound: a long generation that is streaming normally is
 * healthy, and killing it would be a worse bug than the one being fixed. The hang has a
 * distinct shape — NO frames at all — so that is what is bounded, plus an idle gap between
 * frames once flowing. Together they fire exactly on a wedged stream and never on a slow
 * one.
 */
declare function firstFrameTimeoutFor(scheme: string, method: string): number;
/**
 * The two bounds a call runs under (R3-307).
 *
 * `idleMs` is in force while the host reports nobody is being asked; it is cleared while a
 * host prompt is up and restarted, in full, when the prompt goes away. `ceilingMs` runs from
 * call start and is NEVER suspended — it is what releases a caller whose user walked away.
 */
interface CallBounds {
    /** The bound in force while the host is not waiting on a person. */
    idleMs: number;
    /** The absolute bound from call start. Never suspended. */
    ceilingMs: number;
}
/** Which of a call's two bounds elapsed. `idle` means the host was NOT prompting — nobody
 *  was being asked anything, so this is a fault. `ceiling` means the absolute bound ran out,
 *  which for an attended call is an abandoned prompt. */
type DeadlineBound = 'idle' | 'ceiling';
/** The bounds for a one-shot `protocolRequest`. */
declare function boundsFor(scheme: string, method: string): CallBounds;
/** The bounds for a stream's time-to-first-frame. */
declare function firstFrameBoundsFor(scheme: string, method: string): CallBounds;
/** A live deadline that the host-attention signal can suspend. */
interface SuspendableDeadline {
    /** Tell the deadline whether the host is waiting on a person right now. */
    setAwaiting(awaiting: boolean): void;
    /** Clear every timer. Idempotent — safe to call from a `finally`. */
    dispose(): void;
}
/**
 * A deadline with a suspendable idle leg and an unsuspendable ceiling.
 *
 * Pure and injectable (`setTimer`/`clearTimer`) so the suspension rules are unit-testable
 * against a fake clock rather than by waiting minutes for real ones.
 *
 * The idle leg RESTARTS in full when a prompt clears rather than resuming where it left off.
 * That is deliberate: after the user dismisses a prompt the host begins fresh work, and the
 * seconds that elapsed before the prompt say nothing about how long that work should take.
 * The ceiling is what stops a repeatedly-prompting call from running forever.
 */
declare function createSuspendableDeadline(opts: {
    bounds: CallBounds;
    /** Called once, with the bound that elapsed and its length in ms. */
    onExpire: (bound: DeadlineBound, boundMs: number) => void;
    setTimer?: (fn: () => void, ms: number) => unknown;
    clearTimer?: (handle: unknown) => void;
}): SuspendableDeadline;
/** The error a bounded call rejects with. `code` is `'timeout'` — the code R3-303's typed
 *  provider-error taxonomy adopts, so apps see one vocabulary. */
declare class ProtocolTimeoutError extends Error {
    readonly code = "timeout";
    /** `scheme:method` of the call that timed out. */
    readonly call: string;
    /** The bound that elapsed, in ms. */
    readonly timeoutMs: number;
    /** Whether the call was on the attended or unattended bound — the first thing anyone
     *  debugging a timeout needs, and otherwise invisible. */
    readonly attendance: Attendance;
    /** WHICH bound elapsed (R3-307). An attended call that faults on its `idle` bound was not
     *  waiting on anyone — the host said so — and that is a genuinely different diagnosis from
     *  an abandoned prompt hitting the `ceiling`. */
    readonly bound: DeadlineBound;
    constructor(call: string, timeoutMs: number, attendance: Attendance, bound?: DeadlineBound);
}
/** The error a cancelled call rejects with. */
declare class ProtocolCancelledError extends Error {
    readonly code = "cancelled";
    constructor(call: string);
}
/** What the host is waiting for at this moment, as reported on the host-attention channel
 *  (R3-307). Present on a {@link PendingState} only while the host IS prompting. */
interface PendingAttention {
    /** The kind of prompt on screen, or `null` when the host reports a wait it cannot name. */
    kind: HostAttentionKind | null;
    /** `Date.now()` when the wait began, or `null`. */
    since: number | null;
}
/** What `onPending` is told when a call is taking a while. */
interface PendingState {
    call: string;
    attendance: Attendance;
    elapsedMs: number;
    /** Why this call *may* be waiting on a person — present only when attended. It comes from
     *  the classification table, so it is a standing possibility, not a live fact. */
    reason?: string;
    /**
     * What the host is waiting for RIGHT NOW (R3-307) — present only while a host prompt is
     * actually up. Prefer it over {@link reason} when rendering: "tap your passkey" is a
     * sentence the user can act on; "this may need you" is not.
     */
    awaiting?: PendingAttention;
}
/** Options accepted by every bounded host call. */
interface BoundedCallOptions {
    /** Override the classified default. `Infinity` disables the bound — an escape hatch for a
     *  caller that genuinely owns the wait (it must then provide its own way out).
     *
     *  An explicit value is the WHOLE bound: it is never suspended by the host-attention
     *  signal, because a caller that named a number owns the wait. */
    timeoutMs?: number;
    /** Abort the wait. The SDK stops waiting and rejects with `code: 'cancelled'`. */
    signal?: AbortSignal;
    /** Fired when the call passes `PENDING_NOTICE_MS`, so a caller can render a waiting state
     *  rather than an unexplained pause — and again, after that, whenever the host starts or
     *  stops waiting on the user, so the waiting state can name what is on screen now. */
    onPending?: (state: PendingState) => void;
}

export { ATTENDED_FIRST_FRAME_MS, ATTENDED_TIMEOUT_MS, type Attendance, type BoundedCallOptions, type CallBounds, type DeadlineBound, NETWORK_TIMEOUT_MS, PENDING_NOTICE_MS, type PendingAttention, type PendingState, ProtocolCancelledError, ProtocolTimeoutError, STREAM_IDLE_TIMEOUT_MS, type SuspendableDeadline, UNATTENDED_TIMEOUT_MS, attendanceOf, attendanceReason, boundsFor, createSuspendableDeadline, firstFrameBoundsFor, firstFrameTimeoutFor, timeoutFor };
