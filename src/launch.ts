// Launch — the TO-RUN twin of `invokeTask` (STANDING_APP_LIFECYCLE_SPEC §1–§6).
// Where `invokeTask` is FOR-RESULT (await one value, callee exits), `launch` is
// TO-RUN (non-blocking, standing): it starts a bound program RUNNING in a region
// and hands back a HANDLE, never a typed value (R-SAL-1). The launched app earns
// its OWN grants — the only launcher→launched data path is the explicitly
// delegated `capDir`/`capFile` in `input` (§5), attenuated + tainted + gated host-
// side. The host owns the whole lifecycle (visibility, budget, revocation,
// teardown); the launcher only OBSERVES via the handle.
//
// A caller that wants a typed value back uses `invokeTask` instead — the two are
// siblings, not a replacement.
import { protocolRequest, sendMessage, addListener } from './sandboxUtils';
import { LAUNCH_DISMISS, LAUNCH_ENDED, PROTOCOL_LAUNCH } from './generated/protocol';
import { SCHEMES } from './protocolSchemes';

/** Where a launched program runs (§6). `overlay` covers the caller's own region
 *  with opaque host chrome; `stage` replaces the focal app (the elevated into-
 *  stage surface, §7 — refused above the stage-principal ceiling). */
export type LaunchRegion = 'overlay' | 'stage';

/**
 * What to launch (§3) — binding-resolved, NEVER a caller-named app. Exactly one of:
 *  - `entryPoint`: a sibling entry point of the caller's OWN repo (the mini-app
 *    case, `AGENT_AUTHORING §5`) — **rejected `forbidden` until program-identity
 *    `appKey` lands** (R-SAL-2a);
 *  - `task`: a task contract (`open-project`, …), resolved through the user-
 *    overridable `task.<name>` binding to whichever app the user bound (§3 kind 2).
 */
export interface LaunchTarget {
  /** Kind 1 — a sibling entry point of the caller's own repo (mini-app overlay). */
  entryPoint?: string;
  /** Kind 2 — a task contract name (the host resolves the bound provider). */
  task?: string;
  /** Optional accepted contract version for a `task` target (semver, e.g. `^1`). */
  version?: string;
}

export interface LaunchOptions {
  /** Where it runs (§6). */
  region: LaunchRegion;
  /**
   * Delegations + plain data handed to the launched app. `$cap:'dir'|'file'`
   * markers (`capDir`/`capFile`, exported from `./tasks`) are resolved against the
   * launcher's OWN grants and minted as attenuated, `ro`-by-default chroots (§5) —
   * you can only delegate what you already hold. Everything else is plain data.
   */
  input?: Record<string, unknown>;
}

/** The live state of a launch (§2). Terminal states (`dismissed`/`revoked`/
 *  `failed`) are reached identically for self-exit, user dismiss, and host revoke —
 *  the host debounces so the launcher gets no timing oracle (R-SAL-1 / §6.4). */
export type LaunchStatus = 'running' | 'dismissed' | 'revoked' | 'failed';

/** Machine codes a refused `launch` resolves with (§8). */
export type LaunchErrorCode =
  | 'forbidden' // undeclared target; sibling (pre-AA-01); self-resolving target; stage cap absent
  | 'unsupported' // no provider bound / entry point absent / unknown contract version
  | 'budget' // over an R-SAL-8 concurrency/rate limit
  | 'revoked' // a delegated mount was revoked during the create-and-bind window
  | 'cancelled' // the user dismissed the host launch affordance (into-stage only)
  | 'invalid-params' // a malformed `capDir`/`capFile` (`..`/absolute/mode-escalation)
  | 'unknown';

/**
 * The control channel back to a launch — the ONLY thing a launcher gets (§2).
 * There is no typed return value (R-SAL-1); `status`/`onDismiss` are debounced so
 * they cannot time-distinguish a self-exit from a user dismiss.
 */
export interface LaunchHandle {
  /** Host-assigned id for this launch. */
  readonly launchId: string;
  /** The current lifecycle state (§2). */
  readonly status: LaunchStatus;
  /** Ask the host to tear this launch down. Idempotent (double-dismiss is a no-op). */
  dismiss(): void;
  /**
   * Observe the launch ending (self-exit / user dismiss / host revoke — fired
   * identically, R-SAL-1). Returns an unsubscribe fn. Fires at most once; if the
   * launch has already ended it fires on the next tick.
   */
  onDismiss(cb: () => void): () => void;
}

interface LaunchEndedMessage {
  launchId: string;
  status: Exclude<LaunchStatus, 'running'>;
}

/** Live handles awaiting their terminal `launch-ended` message, keyed by launchId. */
const liveHandles = new Map<string, LaunchHandleImpl>();

// The host delivers ONE `launch-ended` message per launch when it tears down —
// the SAME message shape for self-exit, dismiss, and revoke (the host debounces
// so the timing is not an oracle, §6.4). We fan it out to the matching handle.
addListener(LAUNCH_ENDED, (m: LaunchEndedMessage) => {
  const h = liveHandles.get(m.launchId);
  if (h) h._end(m.status);
});

class LaunchHandleImpl implements LaunchHandle {
  #status: LaunchStatus = 'running';
  #dismissListeners = new Set<() => void>();
  #ended = false;

  constructor(readonly launchId: string) {
    liveHandles.set(launchId, this);
  }

  get status(): LaunchStatus {
    return this.#status;
  }

  dismiss(): void {
    if (this.#ended) return;
    // Fire-and-forget: the host owns teardown and answers with `launch-ended`,
    // which drives `_end` (so status/onDismiss are host-authoritative, never
    // optimistically local — a dismiss the host refuses would otherwise desync).
    sendMessage(LAUNCH_DISMISS, { launchId: this.launchId });
  }

  onDismiss(cb: () => void): () => void {
    if (this.#ended) {
      // Already ended: fire on the next tick so the contract ("returns an
      // unsubscribe") holds and the callback never runs synchronously mid-register.
      queueMicrotask(cb);
      return () => {};
    }
    this.#dismissListeners.add(cb);
    return () => {
      this.#dismissListeners.delete(cb);
    };
  }

  /** Host-driven terminal transition — the only writer of `status`. Idempotent. */
  _end(status: Exclude<LaunchStatus, 'running'>): void {
    if (this.#ended) return;
    this.#ended = true;
    this.#status = status;
    liveHandles.delete(this.launchId);
    const listeners = [...this.#dismissListeners];
    this.#dismissListeners.clear();
    for (const l of listeners) {
      try {
        l();
      } catch {
        /* a launcher's own callback must never wedge teardown */
      }
    }
  }
}

/**
 * Launch a bound program to RUN in a region (§2). Non-blocking: resolves once the
 * frame is created and bound, with a {@link LaunchHandle} — or a typed
 * `{ ok:false, code }` on refusal (§8), NEVER a throw for an ordinary refusal (so
 * a launcher branches on `code` without a try/catch). The launched app runs under
 * its OWN grants; the launcher's authority does not flow to it (R-SAL-4).
 *
 *   const h = await launch({ task: 'open-project' }, {
 *     region: 'stage',
 *     input: { dir: capDir({ mountId: 'space:abc', relPath: 'proj' }, { mode: 'ro' }) },
 *   });
 *   if ('ok' in h && h.ok === false) { ...handle h.code... }
 *   else { h.onDismiss(() => ...); }
 */
export const launch = async (
  target: LaunchTarget,
  opts: LaunchOptions,
): Promise<LaunchHandle | { ok: false; code: LaunchErrorCode }> => {
  // The host wraps a successful handler return as `{ ok:true, data }` (the same
  // Recipe-B framing `invokeTask` uses); a refusal is `{ ok:false, code }`.
  const res = (await protocolRequest(SCHEMES[PROTOCOL_LAUNCH], 'create', [{ target, opts }])) as
    | { ok: true; data: { launchId: string } }
    | { ok: false; code?: LaunchErrorCode }
    | undefined;
  if (!res || res.ok !== true || !res.data?.launchId) {
    const code = res && res.ok === false ? res.code ?? 'unknown' : 'unknown';
    return { ok: false, code };
  }
  return new LaunchHandleImpl(res.data.launchId);
};
