import "./chunk-VHAA22YE.js";
const UNATTENDED_TIMEOUT_MS = 3e4;
const NETWORK_TIMEOUT_MS = 12e4;
const ATTENDED_TIMEOUT_MS = 6e5;
const ATTENDED_FIRST_FRAME_MS = 3e5;
const STREAM_IDLE_TIMEOUT_MS = 12e4;
const PENDING_NOTICE_MS = 3e3;
const ATTENDED = {
  // The powerbox and the add-secret modal are host-drawn and wait for the user to type or
  // pick; the first use of any stored secret additionally raises a WebAuthn assertion
  // (SECRETS_SPEC §3 — one unlock per session, from a live gesture). All three are wrapped
  // presenters, so the signal covers this scheme completely.
  secrets: {
    reason: "host-drawn key entry / picker, and the per-session passkey unlock",
    idleMs: UNATTENDED_TIMEOUT_MS
  },
  // Consent is raised INSIDE the request: presentMountConsent, presentGrantPicker,
  // presentCreateConsent, presentShareDisclosure, presentReferenceConsent — every one of
  // them a wrapped presenter. Unattended once the grant is held, attended on first use, and
  // since R3-307 the host says which of those is happening.
  spaces: {
    reason: "first-use mount/share/create consent is drawn inside the request",
    idleMs: UNATTENDED_TIMEOUT_MS
  },
  settings: {
    reason: "settings verbs reach the same consent and picker surfaces as spaces",
    idleMs: UNATTENDED_TIMEOUT_MS
  },
  // The contribute flow shows the full diff for approval before anything is written
  // (TRUST_AND_SAFETY TS-19b: the approval MUST show the real diff, so a human reads it).
  // NOT a wrapped presenter — no `idleMs`.
  contribute: { reason: "the diff-approval step is a human read of the whole change" },
  // A task is an app bound to a transient slot that the user interacts with; it returns
  // when they finish, which is human-paced by construction. That is an APP's interaction,
  // not a host prompt, so the attention channel never fires for it — no `idleMs`.
  task: { reason: "a task app runs an interaction and returns when the user finishes" },
  // Launching a target can raise consent for a not-yet-granted app — through the launch
  // flow's own surface, not one of the wrapped presenters. No `idleMs`.
  launch: { reason: "may raise first-use consent for the launched target" },
  // A drag is a gesture in progress — its duration is the user's hand, and no host prompt
  // is up while it happens. No `idleMs`.
  dnd: { reason: "a drag is a human gesture in flight" },
  // The chat stream's FIRST frame sits behind the session's first passkey unseal — the
  // exact hang the dogfood run found — and that unseal IS a wrapped presenter. But the idle
  // bound here is the NETWORK one, not the channel one: with no prompt up, this call is
  // waiting on an arbitrary upstream model, and thirty seconds is a normal generation.
  llm: {
    reason: "the first frame can sit behind the session passkey unseal",
    idleMs: NETWORK_TIMEOUT_MS
  }
};
function attendedEntry(scheme, method) {
  return ATTENDED[`${scheme}:${method}`] ?? ATTENDED[scheme];
}
function attendedReason(scheme, method) {
  return attendedEntry(scheme, method)?.reason;
}
function attendanceOf(scheme, method) {
  return attendedReason(scheme, method) ? "attended" : "unattended";
}
function attendanceReason(scheme, method) {
  return attendedReason(scheme, method);
}
function timeoutFor(scheme, method) {
  if (attendanceOf(scheme, method) === "attended") return ATTENDED_TIMEOUT_MS;
  if (scheme === "fetch") return NETWORK_TIMEOUT_MS;
  return UNATTENDED_TIMEOUT_MS;
}
function firstFrameTimeoutFor(scheme, method) {
  return attendanceOf(scheme, method) === "attended" ? ATTENDED_FIRST_FRAME_MS : NETWORK_TIMEOUT_MS;
}
function boundsFor(scheme, method) {
  const ceilingMs = timeoutFor(scheme, method);
  const idleMs = attendedEntry(scheme, method)?.idleMs;
  return { idleMs: idleMs === void 0 ? ceilingMs : Math.min(idleMs, ceilingMs), ceilingMs };
}
function firstFrameBoundsFor(scheme, method) {
  const ceilingMs = firstFrameTimeoutFor(scheme, method);
  const idleMs = attendedEntry(scheme, method)?.idleMs;
  return { idleMs: idleMs === void 0 ? ceilingMs : Math.min(idleMs, ceilingMs), ceilingMs };
}
function createSuspendableDeadline(opts) {
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h));
  const { idleMs, ceilingMs } = opts.bounds;
  const hasIdleLeg = Number.isFinite(idleMs) && idleMs < ceilingMs;
  let done = false;
  let idle;
  let ceiling;
  const expire = (bound, boundMs) => {
    if (done) return;
    done = true;
    opts.onExpire(bound, boundMs);
  };
  const armIdle = () => {
    if (done || !hasIdleLeg || idle !== void 0) return;
    idle = setTimer(() => {
      idle = void 0;
      expire("idle", idleMs);
    }, idleMs);
  };
  const disarmIdle = () => {
    if (idle !== void 0) {
      clearTimer(idle);
      idle = void 0;
    }
  };
  if (Number.isFinite(ceilingMs)) {
    ceiling = setTimer(() => {
      ceiling = void 0;
      expire("ceiling", ceilingMs);
    }, ceilingMs);
  }
  armIdle();
  return {
    setAwaiting(awaiting) {
      if (done) return;
      if (awaiting) disarmIdle();
      else armIdle();
    },
    dispose() {
      done = true;
      disarmIdle();
      if (ceiling !== void 0) {
        clearTimer(ceiling);
        ceiling = void 0;
      }
    }
  };
}
class ProtocolTimeoutError extends Error {
  constructor(call, timeoutMs, attendance, bound = attendance === "attended" ? "ceiling" : "idle") {
    super(
      attendance === "attended" && bound === "ceiling" ? `immediately.run: ${call} was abandoned after ${Math.round(timeoutMs / 1e3)}s waiting for you` : `immediately.run: ${call} did not respond within ${Math.round(timeoutMs / 1e3)}s`
    );
    this.code = "timeout";
    this.name = "ProtocolTimeoutError";
    this.call = call;
    this.timeoutMs = timeoutMs;
    this.attendance = attendance;
    this.bound = bound;
  }
}
class ProtocolCancelledError extends Error {
  constructor(call) {
    super(`immediately.run: ${call} was cancelled`);
    this.code = "cancelled";
    this.name = "ProtocolCancelledError";
  }
}
export {
  ATTENDED_FIRST_FRAME_MS,
  ATTENDED_TIMEOUT_MS,
  NETWORK_TIMEOUT_MS,
  PENDING_NOTICE_MS,
  ProtocolCancelledError,
  ProtocolTimeoutError,
  STREAM_IDLE_TIMEOUT_MS,
  UNATTENDED_TIMEOUT_MS,
  attendanceOf,
  attendanceReason,
  boundsFor,
  createSuspendableDeadline,
  firstFrameBoundsFor,
  firstFrameTimeoutFor,
  timeoutFor
};
//# sourceMappingURL=protocolDeadline.js.map