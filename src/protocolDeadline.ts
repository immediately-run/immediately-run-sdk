// Deadlines for host protocol calls (R3-298) — so no platform request can hang forever.
//
// THE FAILURE THIS FIXES. `protocolRequest` and `hostFetch` carried no timeout, so a host
// operation that never resolved presented as an indefinite "Running…" with no error, no
// cancel, and nothing in the console. The GLM dogfood run hit exactly this: the first
// `chat()` of a session parks on a WebAuthn unseal that never completes, and the surface
// simply waits. A first-run user inside the setup wizard (R3-299) would be stranded on
// "Testing…" — at the worst possible moment, on the screen whose whole purpose is to prove
// setup worked.
//
// WHY A SINGLE CONSTANT IS THE WRONG ANSWER, AND WHAT IS DONE INSTEAD. A blanket timeout
// was deferred once as risky, correctly: some host operations legitimately await a HUMAN —
// a passkey tap, a consent decision, a file picker — and a flat deadline aborts those. So
// calls are classified, and the two classes get very different bounds:
//
//   unattended — a network call or a channel round-trip. Nobody is being asked anything, so
//                a reply that has not arrived in tens of seconds is a fault. Short bound.
//   attended   — the host may draw chrome and wait for the user. The bound exists only to
//                stop an ABANDONED prompt from pinning the caller forever, so it is set far
//                beyond human reaction time.
//
// NOTHING IS UNBOUNDED. "A long or absent deadline" was the licence; absent is declined,
// because absent is the bug. An attended bound of minutes never aborts a person who is
// actually deciding, and does release a caller whose user walked away — which is the
// difference between a slow flow and a wedged one.
//
// A KNOWN IMPRECISION, STATED. Attendedness is classified per (scheme, method), but it is
// really a property of a MOMENT: `spaces:mount` is unattended when the grant is already
// held and attended on first use, because the host raises consent inside the request
// (`spaceHandler` `presentMountConsent`). A per-method table cannot see that, so any method
// that MAY prompt is classified `attended` — deliberately erring toward the long bound,
// since a needlessly long bound is a slow failure while a needlessly short one aborts a
// legitimate prompt. Removing the imprecision needs the host to SAY when a call is waiting
// on a person, which is a new host->app wire name and a follow-up item; this file is
// written so that signal can later shorten a bound rather than replace the mechanism.

/** Whether a call may block on a human being asked something. */
export type Attendance = 'unattended' | 'attended';

/** Milliseconds. Exported so callers can reason about the defaults they are overriding. */
export const UNATTENDED_TIMEOUT_MS = 30_000;
/** Network calls reach arbitrary upstreams; the host bounds the fetch itself, so this is a
 *  backstop against the host never replying, not a request budget. */
export const NETWORK_TIMEOUT_MS = 120_000;
/** Far beyond human reaction time — this exists only so an ABANDONED prompt releases the
 *  caller. It must never be short enough to abort someone who is deciding. */
export const ATTENDED_TIMEOUT_MS = 600_000;
/** A stream's first frame may be behind an unseal, so it gets an attended-scale bound of
 *  its own. See `firstFrameTimeoutFor`. */
export const ATTENDED_FIRST_FRAME_MS = 300_000;
/** After the first frame, silence this long means the stream is wedged: the host is no
 *  longer producing and no human is being asked. */
export const STREAM_IDLE_TIMEOUT_MS = 120_000;
/** When a call passes this, `onPending` fires so a caller can render a waiting state
 *  instead of an unexplained stall. */
export const PENDING_NOTICE_MS = 3_000;

/**
 * Methods that may draw host chrome and wait for the user.
 *
 * Each entry is a `scheme:method` or a bare `scheme` (matching every method of it). The
 * REASON is recorded per entry, because this table is the item's actual content — a future
 * reader must be able to see why a method is on the long bound without re-deriving it from
 * the host source.
 */
const ATTENDED: Record<string, string> = {
  // The powerbox and the add-secret modal are host-drawn and wait for the user to type or
  // pick; the first use of any stored secret additionally raises a WebAuthn assertion
  // (SECRETS_SPEC §3 — one unlock per session, from a live gesture).
  secrets: 'host-drawn key entry / picker, and the per-session passkey unlock',
  // Consent is raised INSIDE the request: presentMountConsent, presentGrantPicker,
  // presentCreateConsent, presentShareDisclosure, presentReferenceConsent. Unattended once
  // the grant is held, attended on first use — and the table cannot tell those apart.
  spaces: 'first-use mount/share/create consent is drawn inside the request',
  settings: 'settings verbs reach the same consent and picker surfaces as spaces',
  // The contribute flow shows the full diff for approval before anything is written
  // (TRUST_AND_SAFETY TS-19b: the approval MUST show the real diff, so a human reads it).
  contribute: 'the diff-approval step is a human read of the whole change',
  // A task is an app bound to a transient slot that the user interacts with; it returns
  // when they finish, which is human-paced by construction.
  task: 'a task app runs an interaction and returns when the user finishes',
  // Launching a target can raise consent for a not-yet-granted app.
  launch: 'may raise first-use consent for the launched target',
  // A drag is a gesture in progress — its duration is the user's hand.
  dnd: 'a drag is a human gesture in flight',
  // The chat stream's FIRST frame sits behind the session's first passkey unseal — the
  // exact hang the dogfood run found.
  llm: 'the first frame can sit behind the session passkey unseal',
};

/** Look up a scheme/method in the attended table, preferring the exact method entry. */
function attendedReason(scheme: string, method: string): string | undefined {
  return ATTENDED[`${scheme}:${method}`] ?? ATTENDED[scheme];
}

/** Whether a call may block on a human. Exported for the classification test + tooling. */
export function attendanceOf(scheme: string, method: string): Attendance {
  return attendedReason(scheme, method) ? 'attended' : 'unattended';
}

/** Why a call is classified attended, or `undefined` when it is not. Exported so the
 *  classification is legible from a test failure rather than only from this source. */
export function attendanceReason(scheme: string, method: string): string | undefined {
  return attendedReason(scheme, method);
}

/** The default deadline for a one-shot `protocolRequest`. */
export function timeoutFor(scheme: string, method: string): number {
  if (attendanceOf(scheme, method) === 'attended') return ATTENDED_TIMEOUT_MS;
  // `fetch` reaches an arbitrary upstream, so it gets the network bound rather than the
  // channel-round-trip one.
  if (scheme === 'fetch') return NETWORK_TIMEOUT_MS;
  return UNATTENDED_TIMEOUT_MS;
}

/**
 * The default TIME-TO-FIRST-FRAME bound for a stream.
 *
 * Deliberately not a total-duration bound: a long generation that is streaming normally is
 * healthy, and killing it would be a worse bug than the one being fixed. The hang has a
 * distinct shape — NO frames at all — so that is what is bounded, plus an idle gap between
 * frames once flowing. Together they fire exactly on a wedged stream and never on a slow
 * one.
 */
export function firstFrameTimeoutFor(scheme: string, method: string): number {
  return attendanceOf(scheme, method) === 'attended'
    ? ATTENDED_FIRST_FRAME_MS
    : NETWORK_TIMEOUT_MS;
}

/** The error a bounded call rejects with. `code` is `'timeout'` — the code R3-303's typed
 *  provider-error taxonomy adopts, so apps see one vocabulary. */
export class ProtocolTimeoutError extends Error {
  readonly code = 'timeout';
  /** `scheme:method` of the call that timed out. */
  readonly call: string;
  /** The bound that elapsed, in ms. */
  readonly timeoutMs: number;
  /** Whether the call was on the attended or unattended bound — the first thing anyone
   *  debugging a timeout needs, and otherwise invisible. */
  readonly attendance: Attendance;
  constructor(call: string, timeoutMs: number, attendance: Attendance) {
    super(
      attendance === 'attended'
        ? `immediately.run: ${call} was abandoned after ${Math.round(timeoutMs / 1000)}s waiting for you`
        : `immediately.run: ${call} did not respond within ${Math.round(timeoutMs / 1000)}s`,
    );
    this.name = 'ProtocolTimeoutError';
    this.call = call;
    this.timeoutMs = timeoutMs;
    this.attendance = attendance;
  }
}

/** The error a cancelled call rejects with. */
export class ProtocolCancelledError extends Error {
  readonly code = 'cancelled';
  constructor(call: string) {
    super(`immediately.run: ${call} was cancelled`);
    this.name = 'ProtocolCancelledError';
  }
}

/** What `onPending` is told when a call is taking a while. */
export interface PendingState {
  call: string;
  attendance: Attendance;
  elapsedMs: number;
  /** Why this call may be waiting on a person — present only when attended. Render it:
   *  an unexplained stall is the failure being fixed, and a bare spinner repeats it. */
  reason?: string;
}

/** Options accepted by every bounded host call. */
export interface BoundedCallOptions {
  /** Override the classified default. `Infinity` disables the bound — an escape hatch for a
   *  caller that genuinely owns the wait (it must then provide its own way out). */
  timeoutMs?: number;
  /** Abort the wait. The SDK stops waiting and rejects with `code: 'cancelled'`. */
  signal?: AbortSignal;
  /** Fired once when the call passes `PENDING_NOTICE_MS`, so a caller can render a waiting
   *  state rather than an unexplained pause. */
  onPending?: (state: PendingState) => void;
}
