interface PushChannel<T> {
    /** Pollable snapshot of the current value. */
    get(): T;
    /** Subscribe; invoked immediately with the current value, then on every change. Returns unsubscribe. */
    onChange(listener: (value: T) => void): () => void;
    /** React hook returning the current value, re-rendering on change. */
    use(): T;
}
/** Injectable transport — defaults to the real one; overridden in tests. */
interface ChannelTransport {
    sendMessage: (type: string, data?: Record<string, unknown>) => void;
    addListener: (type: string, handler: (msg: Record<string, unknown>) => void) => () => void;
}
declare function createPushChannel<T>(opts: {
    /** Host→sandbox push message type (e.g. `form-factor`). */
    pushType: string;
    /** Poll message type the SDK sends to pull the current value (e.g. `request-form-factor`). */
    requestType?: string;
    /** Value assumed before the host answers — also the value when the app may not read the channel. */
    initial: T;
    /** Extract + validate the value from a push message; return `undefined` to ignore the message. */
    parse: (msg: Record<string, unknown>) => T | undefined;
}, transport?: ChannelTransport): PushChannel<T>;

export { type ChannelTransport, type PushChannel, createPushChannel };
