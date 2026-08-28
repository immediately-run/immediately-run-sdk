import { BoundedCallOptions } from './protocolDeadline.js';
import './hostAttention.js';

/** One frame of a host stream: an `event` value, the terminal `done` value, or an `error`. */
type StreamFrame = {
    kind: 'event';
    value: unknown;
} | {
    kind: 'done';
    value: unknown;
} | {
    kind: 'error';
    code: string;
    message: string;
};
/** The send/subscribe transport {@link consumeStream} drives (injected so it can be faked in tests). */
interface StreamTransport {
    send: (msg: {
        type: string;
        method: string;
        params: unknown[];
        msgId: number;
        stream: true;
    }) => void;
    subscribe: (type: string, handler: (msg: {
        msgId?: number;
        stream?: StreamFrame;
    }) => void) => () => void;
    cancel?: (msg: {
        type: string;
        msgId: number;
        cancel: true;
    }) => void;
}
/** Thrown when a stream ends in an `error` frame; carries the host's `code`. */
declare class StreamError extends Error {
    code: string;
    constructor(code: string, message: string);
}
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
declare function consumeStream<T = unknown, R = unknown>(transport: StreamTransport, type: string, method: string, params: unknown[], msgId?: number, signal?: AbortSignal, opts?: BoundedCallOptions & {
    idleTimeoutMs?: number;
}): AsyncGenerator<T, R, void>;
/**
 * Consume an elevated streaming protocol method from app code.
 *
 * `for await (const ev of protocolStream('protocol-contribute', 'run', [opts])) …`
 *
 * Pass `signal` to abort the stream (and the host's in-flight work) mid-flight.
 */
declare function protocolStream<T = unknown, R = unknown>(protocolName: string, method: string, params: unknown[], signal?: AbortSignal, opts?: BoundedCallOptions & {
    idleTimeoutMs?: number;
}): AsyncGenerator<T, R, void>;

export { StreamError, type StreamFrame, type StreamTransport, consumeStream, protocolStream };
