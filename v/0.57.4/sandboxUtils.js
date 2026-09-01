import "./chunk-VHAA22YE.js";
import { transport } from "./hostTransport";
import { onHostAttentionChange } from "./hostAttention";
import {
  attendanceOf,
  attendanceReason,
  boundsFor,
  createSuspendableDeadline,
  PENDING_NOTICE_MS,
  ProtocolCancelledError,
  ProtocolTimeoutError
} from "./protocolDeadline";
import { sendMessage, addListener } from "./hostTransport";
const protocolRequest = (protocolName, method, params, opts) => withDeadline(protocolName, method, () => transport().protocolRequest(protocolName, method, params), opts);
async function withDeadline(scheme, method, start, opts) {
  const call = `${scheme}:${method}`;
  const attendance = attendanceOf(scheme, method);
  const bounds = opts?.timeoutMs !== void 0 ? { idleMs: opts.timeoutMs, ceilingMs: opts.timeoutMs } : boundsFor(scheme, method);
  const signal = opts?.signal;
  if (signal?.aborted) throw new ProtocolCancelledError(call);
  const work = start();
  if (!Number.isFinite(bounds.ceilingMs) && !signal && !opts?.onPending) return work;
  let deadline;
  let notice;
  let unsubscribeAttention;
  let onAbort;
  const started = Date.now();
  try {
    return await new Promise((resolve, reject) => {
      work.then(resolve, reject);
      let attention;
      let noticeFired = false;
      const fireNotice = () => {
        try {
          opts?.onPending?.({
            call,
            attendance,
            elapsedMs: Date.now() - started,
            ...attendanceReason(scheme, method) ? { reason: attendanceReason(scheme, method) } : {},
            ...attention?.awaiting ? { awaiting: { kind: attention.kind, since: attention.since } } : {}
          });
        } catch {
        }
      };
      deadline = createSuspendableDeadline({
        bounds,
        onExpire: (bound, elapsedBoundMs) => reject(new ProtocolTimeoutError(call, elapsedBoundMs, attendance, bound))
      });
      if (opts?.onPending) {
        notice = setTimeout(() => {
          noticeFired = true;
          fireNotice();
        }, PENDING_NOTICE_MS);
      }
      try {
        unsubscribeAttention = onHostAttentionChange((next) => {
          const wasAwaiting = attention?.awaiting ?? false;
          attention = next;
          deadline?.setAwaiting(next.awaiting);
          if (noticeFired && next.awaiting !== wasAwaiting) fireNotice();
        });
      } catch {
      }
      if (signal) {
        onAbort = () => reject(new ProtocolCancelledError(call));
        signal.addEventListener("abort", onAbort, { once: true });
      }
    });
  } finally {
    deadline?.dispose();
    if (notice !== void 0) clearTimeout(notice);
    unsubscribeAttention?.();
    if (signal && onAbort) signal.removeEventListener("abort", onAbort);
    work.catch(() => void 0);
  }
}
export {
  addListener,
  protocolRequest,
  sendMessage,
  withDeadline
};
//# sourceMappingURL=sandboxUtils.js.map