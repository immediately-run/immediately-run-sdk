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
// THE IMPRECISION, AND HOW R3-307 REMOVED IT. Attendedness is classified per
// (scheme, method), but it is really a property of a MOMENT: `spaces:mount` is unattended
// when the grant is already held and attended on first use, because the host raises consent
// inside the request (`spaceHandler` `presentMountConsent`). A per-method table cannot see
// that, so R3-298 classified any method that MAY prompt as `attended` and gave it the long
// bound — which meant the common grant-held path also waited ten minutes before reporting a
// fault.
//
// R3-307 added the host-attention channel (`hostAttention.ts`), on which the host says
// whether a person is being asked something RIGHT NOW. So a call now carries TWO bounds:
//
//   idle    — in force while the host is not prompting. A may-prompt call runs on this,
//             which is a real correctness gain: the grant-held `spaces:mount` faults in
//             seconds, as it always should have.
//   ceiling — absolute, from call start, NEVER suspended. An abandoned prompt still
//             releases the caller. The signal may EXTEND a deadline, never remove it.
//
// AND THE SHORTENING IS OPT-IN PER ENTRY, which is the part worth not losing. A scheme
// drops to the short idle bound only when EVERY prompt it can raise is one the host
// actually announces on that channel (the powerbox, the add-secret modal, the passkey
// unlock, and the spaceHandler consent surfaces — the presenters site-main wraps). A task
// app's interaction and the contribute diff-approval are human-paced but are NOT host
// prompts, so no signal would ever fire for them and they keep the full attended bound. A
// signal that cannot fire must never be allowed to shorten a deadline.

import type { HostAttentionKind } from './hostAttention';

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
interface AttendedEntry {
  /** Why this call may block on a human. */
  reason: string;
  /**
   * The bound this call runs on while the host reports NOBODY is being asked (R3-307).
   *
   * Set it ONLY when every prompt this entry can raise is one the host announces on the
   * host-attention channel — i.e. a presenter site-main wraps (`hostAttention.ts` in that
   * repo). Omitted ⇒ the call keeps the full attended bound at all times, because a signal
   * that never fires must not be allowed to shorten a deadline.
   */
  idleMs?: number;
}

const ATTENDED: Record<string, AttendedEntry> = {
  // The powerbox and the add-secret modal are host-drawn and wait for the user to type or
  // pick; the first use of any stored secret additionally raises a WebAuthn assertion
  // (SECRETS_SPEC §3 — one unlock per session, from a live gesture). All three are wrapped
  // presenters, so the signal covers this scheme completely.
  secrets: {
    reason: 'host-drawn key entry / picker, and the per-session passkey unlock',
    idleMs: UNATTENDED_TIMEOUT_MS,
  },
  // Consent is raised INSIDE the request: presentMountConsent, presentGrantPicker,
  // presentCreateConsent, presentShareDisclosure, presentReferenceConsent — every one of
  // them a wrapped presenter. Unattended once the grant is held, attended on first use, and
  // since R3-307 the host says which of those is happening.
  spaces: {
    reason: 'first-use mount/share/create consent is drawn inside the request',
    idleMs: UNATTENDED_TIMEOUT_MS,
  },
  settings: {
    reason: 'settings verbs reach the same consent and picker surfaces as spaces',
    idleMs: UNATTENDED_TIMEOUT_MS,
  },
  // The contribute flow shows the full diff for approval before anything is written
  // (TRUST_AND_SAFETY TS-19b: the approval MUST show the real diff, so a human reads it).
  // NOT a wrapped presenter — no `idleMs`.
  contribute: { reason: 'the diff-approval step is a human read of the whole change' },
  // A task is an app bound to a transient slot that the user interacts with; it returns
  // when they finish, which is human-paced by construction. That is an APP's interaction,
  // not a host prompt, so the attention channel never fires for it — no `idleMs`.
  task: { reason: 'a task app runs an interaction and returns when the user finishes' },
  // Launching a target can raise consent for a not-yet-granted app — through the launch
  // flow's own surface, not one of the wrapped presenters. No `idleMs`.
  launch: { reason: 'may raise first-use consent for the launched target' },
  // A drag is a gesture in progress — its duration is the user's hand, and no host prompt
  // is up while it happens. No `idleMs`.
  dnd: { reason: 'a drag is a human gesture in flight' },
  // The chat stream's FIRST frame sits behind the session's first passkey unseal — the
  // exact hang the dogfood run found — and that unseal IS a wrapped presenter. But the idle
  // bound here is the NETWORK one, not the channel one: with no prompt up, this call is
  // waiting on an arbitrary upstream model, and thirty seconds is a normal generation.
  llm: {
    reason: 'the first frame can sit behind the session passkey unseal',
    idleMs: NETWORK_TIMEOUT_MS,
  },
};

/** Look up a scheme/method in the attended table, preferring the exact method entry. */
function attendedEntry(scheme: string, method: string): AttendedEntry | undefined {
  return ATTENDED[`${scheme}:${method}`] ?? ATTENDED[scheme];
}

/** Look up a scheme/method in the attended table, preferring the exact method entry. */
function attendedReason(scheme: string, method: string): string | undefined {
  return attendedEntry(scheme, method)?.reason;
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
  return attendanceOf(scheme, method) === 'attended' ? ATTENDED_FIRST_FRAME_MS : NETWORK_TIMEOUT_MS;
}

/**
 * The two bounds a call runs under (R3-307).
 *
 * `idleMs` is in force while the host reports nobody is being asked; it is cleared while a
 * host prompt is up and restarted, in full, when the prompt goes away. `ceilingMs` runs from
 * call start and is NEVER suspended — it is what releases a caller whose user walked away.
 */
export interface CallBounds {
  /** The bound in force while the host is not waiting on a person. */
  idleMs: number;
  /** The absolute bound from call start. Never suspended. */
  ceilingMs: number;
}

/** Which of a call's two bounds elapsed. `idle` means the host was NOT prompting — nobody
 *  was being asked anything, so this is a fault. `ceiling` means the absolute bound ran out,
 *  which for an attended call is an abandoned prompt. */
export type DeadlineBound = 'idle' | 'ceiling';

/** The bounds for a one-shot `protocolRequest`. */
export function boundsFor(scheme: string, method: string): CallBounds {
  const ceilingMs = timeoutFor(scheme, method);
  const idleMs = attendedEntry(scheme, method)?.idleMs;
  // `Math.min` so an `idleMs` can only ever tighten: an entry that named a bound longer than
  // its own ceiling would otherwise silently disable the idle leg.
  return { idleMs: idleMs === undefined ? ceilingMs : Math.min(idleMs, ceilingMs), ceilingMs };
}

/** The bounds for a stream's time-to-first-frame. */
export function firstFrameBoundsFor(scheme: string, method: string): CallBounds {
  const ceilingMs = firstFrameTimeoutFor(scheme, method);
  const idleMs = attendedEntry(scheme, method)?.idleMs;
  return { idleMs: idleMs === undefined ? ceilingMs : Math.min(idleMs, ceilingMs), ceilingMs };
}

/** A live deadline that the host-attention signal can suspend. */
export interface SuspendableDeadline {
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
export function createSuspendableDeadline(opts: {
  bounds: CallBounds;
  /** Called once, with the bound that elapsed and its length in ms. */
  onExpire: (bound: DeadlineBound, boundMs: number) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}): SuspendableDeadline {
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const { idleMs, ceilingMs } = opts.bounds;
  // An idle leg at or above the ceiling can never fire first, so don't arm one — that keeps
  // the common unattended case (idle === ceiling) on exactly one timer, as before R3-307.
  const hasIdleLeg = Number.isFinite(idleMs) && idleMs < ceilingMs;

  let done = false;
  let idle: unknown;
  let ceiling: unknown;

  const expire = (bound: DeadlineBound, boundMs: number) => {
    if (done) return;
    done = true;
    opts.onExpire(bound, boundMs);
  };

  const armIdle = () => {
    if (done || !hasIdleLeg || idle !== undefined) return;
    idle = setTimer(() => {
      idle = undefined;
      expire('idle', idleMs);
    }, idleMs);
  };
  const disarmIdle = () => {
    if (idle !== undefined) {
      clearTimer(idle);
      idle = undefined;
    }
  };

  if (Number.isFinite(ceilingMs)) {
    ceiling = setTimer(() => {
      ceiling = undefined;
      expire('ceiling', ceilingMs);
    }, ceilingMs);
  }
  armIdle();

  return {
    setAwaiting(awaiting: boolean) {
      if (done) return;
      if (awaiting) disarmIdle();
      else armIdle();
    },
    dispose() {
      done = true;
      disarmIdle();
      if (ceiling !== undefined) {
        clearTimer(ceiling);
        ceiling = undefined;
      }
    },
  };
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
  /** WHICH bound elapsed (R3-307). An attended call that faults on its `idle` bound was not
   *  waiting on anyone — the host said so — and that is a genuinely different diagnosis from
   *  an abandoned prompt hitting the `ceiling`. */
  readonly bound: DeadlineBound;
  constructor(
    call: string,
    timeoutMs: number,
    attendance: Attendance,
    bound: DeadlineBound = attendance === 'attended' ? 'ceiling' : 'idle',
  ) {
    super(
      attendance === 'attended' && bound === 'ceiling'
        ? `immediately.run: ${call} was abandoned after ${Math.round(timeoutMs / 1000)}s waiting for you`
        : `immediately.run: ${call} did not respond within ${Math.round(timeoutMs / 1000)}s`,
    );
    this.name = 'ProtocolTimeoutError';
    this.call = call;
    this.timeoutMs = timeoutMs;
    this.attendance = attendance;
    this.bound = bound;
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

/** What the host is waiting for at this moment, as reported on the host-attention channel
 *  (R3-307). Present on a {@link PendingState} only while the host IS prompting. */
export interface PendingAttention {
  /** The kind of prompt on screen, or `null` when the host reports a wait it cannot name. */
  kind: HostAttentionKind | null;
  /** `Date.now()` when the wait began, or `null`. */
  since: number | null;
}

/** What `onPending` is told when a call is taking a while. */
export interface PendingState {
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
export interface BoundedCallOptions {
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
