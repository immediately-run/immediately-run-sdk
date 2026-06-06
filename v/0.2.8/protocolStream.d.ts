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
}
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
 */
declare function consumeStream<T = unknown, R = unknown>(transport: StreamTransport, type: string, method: string, params: unknown[], msgId?: number): AsyncGenerator<T, R, void>;
/**
 * Consume an elevated streaming protocol method from app code.
 *
 * `for await (const ev of protocolStream('protocol-contribute', 'run', [opts])) …`
 */
declare function protocolStream<T = unknown, R = unknown>(protocolName: string, method: string, params: unknown[]): AsyncGenerator<T, R, void>;

export { StreamError, type StreamFrame, type StreamTransport, consumeStream, protocolStream };
