// SDK-side consumer for the host streaming transport (UI_AS_APPS_SPEC §5.1).
//
// The host `pumpGenerator` emits, per request msgId, a run of `stream.event`
// frames terminated by one `stream.done` (with the return value) or `stream.error`
// frame. This reassembles that run into an AsyncGenerator: each `event` is a
// `yield`, the `done` value is the generator's `return`, an `error` is a `throw`.
//
// `consumeStream` takes an injected `StreamTransport` so it's unit-tested with a
// fake send/subscribe — no bundler. `protocolStream`/`contribute` below wire it to
// the real sandbox messageBus via sandboxUtils.
import { addListener, sendMessage } from './sandboxUtils';
import {
  attendanceOf,
  attendanceReason,
  firstFrameTimeoutFor,
  PENDING_NOTICE_MS,
  ProtocolTimeoutError,
  STREAM_IDLE_TIMEOUT_MS,
  type BoundedCallOptions,
} from './protocolDeadline';

/** One frame of a host stream: an `event` value, the terminal `done` value, or an `error`. */
export type StreamFrame =
  | { kind: 'event'; value: unknown }
  | { kind: 'done'; value: unknown }
  | { kind: 'error'; code: string; message: string };

/** The send/subscribe transport {@link consumeStream} drives (injected so it can be faked in tests). */
export interface StreamTransport {
  // Fire the request that starts the stream. The host replies with frames tagged
  // by the same `msgId`.
  send: (msg: { type: string; method: string; params: unknown[]; msgId: number; stream: true }) => void;
  // Subscribe to inbound frames for `type`; returns an unsubscribe.
  subscribe: (
    type: string,
    handler: (msg: { msgId?: number; stream?: StreamFrame }) => void
  ) => () => void;
  // Tell the host to STOP the stream early — abort the in-flight generation (and,
  // for `llm:chat`, the upstream provider fetch so it stops BILLING). Sent when the
  // consumer bails before a terminal frame: an early `break`/`return` out of the
  // `for await`, or an `AbortSignal` firing. Carries the same `(type, msgId)` the
  // host tagged its frames with, so the host aborts the matching generator
  // (LLM_AND_AGENTS_SPEC §3.3 "abort the in-flight LLM request"). Optional — a
  // transport predating the cancel frame simply omits it and the old behavior
  // (host runs to completion) stands.
  cancel?: (msg: { type: string; msgId: number; cancel: true }) => void;
}

/** Thrown when a stream ends in an `error` frame; carries the host's `code`. */
export class StreamError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'StreamError';
    this.code = code;
  }
}

let streamCounter = 0;
const nextMsgId = (): number => {
  // Distinct from the bundler's own protocolRequest counter space is unnecessary —
  // frames are filtered by (type, msgId, stream) so a collision with a one-shot
  // reply (which has `result`, not `stream`) can't be misread.
  streamCounter = (streamCounter + 1) % Number.MAX_SAFE_INTEGER;
  return streamCounter;
};

/**
 * Drive one streamed request to completion over an injected transport.
 *
 * Yields each event value; returns the `done` value; throws `StreamError` on an
 * error frame. Always unsubscribes (via the generator's `finally`) so an early
 * `break` in the consumer doesn't leak the listener.
 *
 * `signal` wires a caller {@link AbortSignal} to mid-stream cancellation: when it
 * fires (or the consumer `break`s before a terminal frame), the `finally` sends a
 * `cancel` frame back over `transport.cancel` so the HOST stops generating — without
 * it, aborting only stops the app-side iterator while the upstream provider keeps
 * streaming and BILLING (LLM_AND_AGENTS_SPEC §3.3, R3-224 / adversarial F2).
 */
export async function* consumeStream<T = unknown, R = unknown>(
  transport: StreamTransport,
  type: string,
  method: string,
  params: unknown[],
  msgId: number = nextMsgId(),
  signal?: AbortSignal,
  opts?: BoundedCallOptions & { idleTimeoutMs?: number }
): AsyncGenerator<T, R, void> {
  const queue: StreamFrame[] = [];
  let wake: (() => void) | null = null;
  // True once a terminal (`done`/`error`) frame arrived — so the `finally` knows the
  // host already stopped and must NOT send a redundant cancel. Left false when the
  // consumer bails early or the signal aborts (the two cases that DO need a cancel).
  let settled = false;
  // True once the request frame went out. A cancel is only meaningful for a stream
  // the host actually started — an abort BEFORE `send` sends nothing to cancel.
  let started = false;
  const push = (frame: StreamFrame) => {
    queue.push(frame);
    const w = wake;
    wake = null;
    w?.();
  };

  const unsubscribe = transport.subscribe(type, (msg) => {
    if (msg.msgId !== msgId || !msg.stream) return;
    push(msg.stream);
  });

  // An abort wakes the pull loop out of its idle `await`; the loop then throws.
  const onAbort = () => {
    const w = wake;
    wake = null;
    w?.();
  };
  if (signal) signal.addEventListener('abort', onAbort);

  // R3-298 — a stream is bounded by SILENCE, not by duration.
  //
  // A total-duration deadline would be wrong here: a long generation that is streaming
  // normally is healthy, and aborting it would be a worse bug than the hang. The hang has a
  // distinct shape — no frames at all — so that is what is bounded: a time-to-FIRST-FRAME
  // deadline, then an idle-gap deadline once frames are flowing. Together they fire exactly
  // on a wedged stream and never on a slow one.
  //
  // The scheme's `type` is `protocol-llm`; the classification table is keyed on the bare
  // scheme, so strip the prefix. The chat stream is classified ATTENDED because its first
  // frame can sit behind the session's first passkey unseal — the dogfood hang.
  const scheme = type.startsWith('protocol-') ? type.slice('protocol-'.length) : type;
  const call = `${scheme}:${method}`;
  const attendance = attendanceOf(scheme, method);
  const firstFrameMs = opts?.timeoutMs ?? firstFrameTimeoutFor(scheme, method);
  const idleMs = opts?.idleTimeoutMs ?? STREAM_IDLE_TIMEOUT_MS;
  let sawFrame = false;
  let noticed = false;

  /** Wait for the next frame, bounded. Rejects with a typed timeout rather than parking. */
  const awaitFrame = async (): Promise<void> => {
    const budget = sawFrame ? idleMs : firstFrameMs;
    if (!Number.isFinite(budget)) {
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
      return;
    }
    const startedAt = Date.now();
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let notice: ReturnType<typeof setTimeout> | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        wake = resolve;
        deadline = setTimeout(
          () => reject(new ProtocolTimeoutError(call, budget, attendance)),
          budget,
        );
        if (opts?.onPending && !noticed) {
          notice = setTimeout(() => {
            noticed = true;
            try {
              opts.onPending?.({
                call,
                attendance,
                elapsedMs: Date.now() - startedAt,
                ...(attendanceReason(scheme, method)
                  ? { reason: attendanceReason(scheme, method) as string }
                  : {}),
              });
            } catch {
              /* a caller's render callback must never break the stream it describes */
            }
          }, PENDING_NOTICE_MS);
        }
      });
    } finally {
      if (deadline !== undefined) clearTimeout(deadline);
      if (notice !== undefined) clearTimeout(notice);
      wake = null;
    }
  };

  try {
    if (signal?.aborted) throw new StreamError('aborted', 'stream aborted before start');
    transport.send({ type, method, params, msgId, stream: true });
    started = true;
    while (true) {
      if (signal?.aborted) throw new StreamError('aborted', 'stream aborted');
      if (queue.length === 0) {
        // A timeout throws out of here into the `finally`, which sends the host a real
        // cancel frame — so a wedged stream stops generating and BILLING rather than being
        // merely abandoned by the app. Streams can do this because they own their `msgId`.
        await awaitFrame();
        continue;
      }
      sawFrame = true;
      const frame = queue.shift() as StreamFrame;
      if (frame.kind === 'event') {
        yield frame.value as T;
      } else if (frame.kind === 'done') {
        settled = true;
        return frame.value as R;
      } else {
        settled = true;
        throw new StreamError(frame.code, frame.message);
      }
    }
  } finally {
    unsubscribe();
    if (signal) signal.removeEventListener('abort', onAbort);
    // Consumer stopped pulling before a terminal frame (early break/return, or the
    // signal aborted): tell the host to stop the in-flight generation + billing.
    if (started && !settled) transport.cancel?.({ type, msgId, cancel: true });
  }
}

// The real sandbox transport, built from the bundler messageBus helpers. `cancel`
// rides the same messageBus as `send` — a `{type, msgId, cancel:true}` frame the
// host dispatcher routes to the in-flight generator's AbortController.
const bundlerTransport: StreamTransport = {
  send: (msg) => sendMessage(msg.type, msg as unknown as Record<string, unknown>),
  subscribe: (type, handler) =>
    addListener(type, (msg) => handler(msg as { msgId?: number; stream?: StreamFrame })),
  cancel: (msg) => sendMessage(msg.type, msg as unknown as Record<string, unknown>),
};

/**
 * Consume an elevated streaming protocol method from app code.
 *
 * `for await (const ev of protocolStream('protocol-contribute', 'run', [opts])) …`
 *
 * Pass `signal` to abort the stream (and the host's in-flight work) mid-flight.
 */
export function protocolStream<T = unknown, R = unknown>(
  protocolName: string,
  method: string,
  params: unknown[],
  signal?: AbortSignal,
  opts?: BoundedCallOptions & { idleTimeoutMs?: number }
): AsyncGenerator<T, R, void> {
  return consumeStream<T, R>(
    bundlerTransport,
    protocolName,
    method,
    params,
    undefined,
    signal,
    opts
  );
}
