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

export type StreamFrame =
  | { kind: 'event'; value: unknown }
  | { kind: 'done'; value: unknown }
  | { kind: 'error'; code: string; message: string };

export interface StreamTransport {
  // Fire the request that starts the stream. The host replies with frames tagged
  // by the same `msgId`.
  send: (msg: { type: string; method: string; params: unknown[]; msgId: number; stream: true }) => void;
  // Subscribe to inbound frames for `type`; returns an unsubscribe.
  subscribe: (
    type: string,
    handler: (msg: { msgId?: number; stream?: StreamFrame }) => void
  ) => () => void;
}

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
 */
export async function* consumeStream<T = unknown, R = unknown>(
  transport: StreamTransport,
  type: string,
  method: string,
  params: unknown[],
  msgId: number = nextMsgId()
): AsyncGenerator<T, R, void> {
  const queue: StreamFrame[] = [];
  let wake: (() => void) | null = null;
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

  try {
    transport.send({ type, method, params, msgId, stream: true });
    while (true) {
      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        continue;
      }
      const frame = queue.shift() as StreamFrame;
      if (frame.kind === 'event') {
        yield frame.value as T;
      } else if (frame.kind === 'done') {
        return frame.value as R;
      } else {
        throw new StreamError(frame.code, frame.message);
      }
    }
  } finally {
    unsubscribe();
  }
}

// The real sandbox transport, built from the bundler messageBus helpers.
const bundlerTransport: StreamTransport = {
  send: (msg) => sendMessage(msg.type, msg as unknown as Record<string, unknown>),
  subscribe: (type, handler) =>
    addListener(type, (msg) => handler(msg as { msgId?: number; stream?: StreamFrame })),
};

/**
 * Consume an elevated streaming protocol method from app code.
 *
 * `for await (const ev of protocolStream('protocol-contribute', 'run', [opts])) …`
 */
export function protocolStream<T = unknown, R = unknown>(
  protocolName: string,
  method: string,
  params: unknown[]
): AsyncGenerator<T, R, void> {
  return consumeStream<T, R>(bundlerTransport, protocolName, method, params);
}
