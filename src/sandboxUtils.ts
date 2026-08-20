// Host transport access (SDK_PACKAGING_SPEC §4, expose-transport). All host comms
// (sendMessage / protocolRequest / onMessage) go through ONE resolver so the SDK is
// transport-agnostic: it works whether it was INJECTED into the bundler's evaluation
// context (the current path — `module.evaluation.module.bundler.messageBus`) OR
// fetched from npm as an ordinary dependency, in which case the sandbox runtime hands
// it the transport via the §4 discovery global (`globalThis.__immediatelyRun__`).
//
// Dual-mode (§8): injection wins while it's active, so existing behaviour is
// byte-for-byte preserved; the global is the fallback the npm-fetched SDK uses. When
// injection is removed (phase 3), only the global path remains — `bundler.*` stops
// being API, which is the whole point.
import { getHostRuntime } from './hostRuntime';
import {
  attendanceOf,
  attendanceReason,
  PENDING_NOTICE_MS,
  ProtocolCancelledError,
  ProtocolTimeoutError,
  timeoutFor,
  type BoundedCallOptions,
} from './protocolDeadline';

interface HostTransport {
  sendMessage(type: string, data?: Record<string, any>): void;
  protocolRequest(protocolName: string, method: string, params: Array<any>): Promise<any>;
  onMessage(handler: (msg: any) => void): { dispose(): void };
}

function transport(): HostTransport {
  // Injected bundler messageBus first — the current path, unchanged.
  try {
    // @ts-ignore - `module.evaluation` is injected by the sandbox runtime
    const injected = module?.evaluation?.module?.bundler?.messageBus;
    if (injected && typeof injected.sendMessage === 'function') return injected;
  } catch {
    /* no injection in this realm — fall through to the §4 global */
  }
  // §4 runtime-discovery transport (the npm-fetched SDK path).
  const t = getHostRuntime()?.transport as HostTransport | undefined;
  if (t && typeof t.sendMessage === 'function') return t;
  throw new Error('immediately.run: no host transport (neither injected nor __immediatelyRun__)');
}

export const sendMessage = (type: string, data: Record<string, any> = {}) => {
  transport().sendMessage(type, data);
};

/**
 * One host protocol request, BOUNDED (R3-298).
 *
 * The bound comes from the call's classification (`protocolDeadline.ts`): an unattended
 * channel round-trip gets tens of seconds, a call that may draw host chrome and wait for a
 * person gets minutes. Nothing is unbounded — an unbounded wait is the failure this fixes.
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
  withDeadline(
    protocolName,
    method,
    () => transport().protocolRequest(protocolName, method, params),
    opts,
  );

/**
 * Race a host call against its deadline, a caller abort, and a pending notice.
 *
 * Kept separate from the transport so it is unit-testable against a promise that simply
 * never settles — which is the whole scenario, and one no live transport reproduces on
 * demand.
 */
export async function withDeadline<T>(
  scheme: string,
  method: string,
  start: () => Promise<T>,
  opts?: BoundedCallOptions,
): Promise<T> {
  const call = `${scheme}:${method}`;
  const attendance = attendanceOf(scheme, method);
  const timeoutMs = opts?.timeoutMs ?? timeoutFor(scheme, method);
  const signal = opts?.signal;

  if (signal?.aborted) throw new ProtocolCancelledError(call);

  const work = start();
  // No bound and no abort wanted: hand back the untouched promise rather than wrapping it
  // in timers that would never fire.
  if (!Number.isFinite(timeoutMs) && !signal && !opts?.onPending) return work;

  let deadline: ReturnType<typeof setTimeout> | undefined;
  let notice: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const started = Date.now();

  try {
    return await new Promise<T>((resolve, reject) => {
      // `work` settling always wins — a call that answered a millisecond before its
      // deadline must not be reported as a timeout.
      work.then(resolve, reject);

      if (Number.isFinite(timeoutMs)) {
        deadline = setTimeout(
          () => reject(new ProtocolTimeoutError(call, timeoutMs, attendance)),
          timeoutMs,
        );
      }
      if (opts?.onPending) {
        notice = setTimeout(() => {
          try {
            opts.onPending?.({
              call,
              attendance,
              elapsedMs: Date.now() - started,
              ...(attendanceReason(scheme, method)
                ? { reason: attendanceReason(scheme, method) as string }
                : {}),
            });
          } catch {
            /* a caller's render callback must never break the call it describes */
          }
        }, PENDING_NOTICE_MS);
      }
      if (signal) {
        onAbort = () => reject(new ProtocolCancelledError(call));
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  } finally {
    if (deadline !== undefined) clearTimeout(deadline);
    if (notice !== undefined) clearTimeout(notice);
    if (signal && onAbort) signal.removeEventListener('abort', onAbort);
    // The host may still answer after we stopped waiting; swallow it so a late rejection
    // does not surface as an unhandled promise rejection in the app's console.
    work.catch(() => undefined);
  }
}

export const addListener = (
  msgType: string,
  handler: (msg: any) => void,
  event?: any,
): (() => void) => {
  const onMessage = event ?? transport().onMessage;
  const disposable = onMessage((msg: any) => {
    if (msg.type === msgType) {
      handler(msg);
    }
  });
  return () => disposable.dispose();
};
