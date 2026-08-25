// Bounded host calls (R3-298) + the host-attention-aware deadline (R3-307).
//
// The transport primitives this builds on moved to `hostTransport.ts` — see that file for
// why. `sendMessage` and `addListener` are re-exported here unchanged, so every existing
// import site (and this module's api-snapshot entry) is exactly as it was.
import { transport } from './hostTransport';
import { onHostAttentionChange, type HostAttention } from './hostAttention';

import {
  attendanceOf,
  attendanceReason,
  boundsFor,
  createSuspendableDeadline,
  PENDING_NOTICE_MS,
  ProtocolCancelledError,
  ProtocolTimeoutError,
  type BoundedCallOptions,
  type CallBounds,
} from './protocolDeadline';

export { sendMessage, addListener } from './hostTransport';

/**
 * One host protocol request, BOUNDED (R3-298).
 *
 * The bound comes from the call's classification (`protocolDeadline.ts`): an unattended
 * channel round-trip gets tens of seconds, a call that may draw host chrome and wait for a
 * person gets minutes. Nothing is unbounded — an unbounded wait is the failure this fixes.
 *
 * Since R3-307 a call whose prompts the host actually announces runs on the SHORT bound and
 * is suspended only while the host says a person is being asked, so the common
 * grant-already-held path reports a fault in seconds instead of minutes. The absolute
 * ceiling still applies: the signal may extend a deadline, never remove it.
 *
 * The host's own work is NOT cancelled by `signal` or by the deadline. The one-shot
 * transport allocates its `msgId` internally, so the SDK has no handle to send the host a
 * cancel for (streams do, and `consumeStream` uses it). What the caller gets back is
 * control: it stops waiting and gets a typed error instead of hanging. A host prompt that
 * is already on screen stays there until the user dismisses it, which is correct — the SDK
 * must not be able to tear down host chrome the user is looking at.
 */
export const protocolRequest = (
  protocolName: string,
  method: string,
  params: Array<any>,
  opts?: BoundedCallOptions,
): Promise<any> =>
  withDeadline(protocolName, method, () => transport().protocolRequest(protocolName, method, params), opts);

/**
 * Race a host call against its deadline, a caller abort, and a pending notice.
 *
 * Kept separate from the transport so it is unit-testable against a promise that simply
 * never settles — which is the whole scenario, and one no live transport reproduces on
 * demand.
 *
 * An explicit `opts.timeoutMs` is the WHOLE bound and is never suspended: a caller that
 * names a number owns the wait, and silently stretching it past what they asked for would
 * be the same class of surprise this machinery exists to remove.
 */
export async function withDeadline<T>(
  scheme: string,
  method: string,
  start: () => Promise<T>,
  opts?: BoundedCallOptions,
): Promise<T> {
  const call = `${scheme}:${method}`;
  const attendance = attendanceOf(scheme, method);
  const bounds: CallBounds =
    opts?.timeoutMs !== undefined ? { idleMs: opts.timeoutMs, ceilingMs: opts.timeoutMs } : boundsFor(scheme, method);
  const signal = opts?.signal;

  if (signal?.aborted) throw new ProtocolCancelledError(call);

  const work = start();
  // No bound and no abort wanted: hand back the untouched promise rather than wrapping it
  // in timers that would never fire.
  if (!Number.isFinite(bounds.ceilingMs) && !signal && !opts?.onPending) return work;

  let deadline: { setAwaiting: (a: boolean) => void; dispose: () => void } | undefined;
  let notice: ReturnType<typeof setTimeout> | undefined;
  let unsubscribeAttention: (() => void) | undefined;
  let onAbort: (() => void) | undefined;
  const started = Date.now();

  try {
    return await new Promise<T>((resolve, reject) => {
      // `work` settling always wins — a call that answered a millisecond before its
      // deadline must not be reported as a timeout.
      work.then(resolve, reject);

      // The host's live "a person is being asked" signal. Read defensively: a host that
      // never pushes the channel leaves this at "not awaiting", which is exactly the
      // pre-R3-307 behaviour for a call on its idle bound.
      let attention: HostAttention | undefined;
      let noticeFired = false;
      const fireNotice = () => {
        try {
          opts?.onPending?.({
            call,
            attendance,
            elapsedMs: Date.now() - started,
            ...(attendanceReason(scheme, method) ? { reason: attendanceReason(scheme, method) as string } : {}),
            ...(attention?.awaiting ? { awaiting: { kind: attention.kind, since: attention.since } } : {}),
          });
        } catch {
          /* a caller's render callback must never break the call it describes */
        }
      };

      deadline = createSuspendableDeadline({
        bounds,
        onExpire: (bound, elapsedBoundMs) => reject(new ProtocolTimeoutError(call, elapsedBoundMs, attendance, bound)),
      });

      if (opts?.onPending) {
        notice = setTimeout(() => {
          noticeFired = true;
          fireNotice();
        }, PENDING_NOTICE_MS);
      }

      // Subscribing invokes the listener immediately with the current value, so the
      // deadline starts in the right state even if a prompt was already up.
      //
      // Guarded because this sits on the path of EVERY host call: a fault in the attention
      // channel must degrade to "no signal" (the pre-R3-307 behaviour, bounds unsuspended),
      // never take down every request in the SDK.
      try {
        unsubscribeAttention = onHostAttentionChange((next) => {
          const wasAwaiting = attention?.awaiting ?? false;
          attention = next;
          deadline?.setAwaiting(next.awaiting);
          // Re-notify once the notice has fired: "still waiting" → "tap your passkey" is
          // the whole point, and a caller rendering a waiting state wants the live
          // sentence, not the one that was true three seconds in.
          if (noticeFired && next.awaiting !== wasAwaiting) fireNotice();
        });
      } catch {
        /* no attention signal available — the bounds simply never suspend */
      }

      if (signal) {
        onAbort = () => reject(new ProtocolCancelledError(call));
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  } finally {
    deadline?.dispose();
    if (notice !== undefined) clearTimeout(notice);
    unsubscribeAttention?.();
    if (signal && onAbort) signal.removeEventListener('abort', onAbort);
    // The host may still answer after we stopped waiting; swallow it so a late rejection
    // does not surface as an unhandled promise rejection in the app's console.
    work.catch(() => undefined);
  }
}
