/** vscode-style Event source: subscribe with a listener, get a disposable back. */
type EventSource = (listener: (msg: any) => void) => {
    dispose(): void;
};
/** The injected bundler's metadata emitter — fires `{type:'metadata-update', update}`
 *  as files (re)compile. Absent when the SDK is npm-fetched (no injection). */
interface InjectedMetadataEmitter {
    onMetadataChange: EventSource;
    /** Start the DelayedEmitter once a subscriber is attached (injected path only). */
    enable(): void;
}
/** The injected bundler's metadata emitter, or null when npm-fetched. */
declare const getInjectedMetadataEmitter: () => InjectedMetadataEmitter | null;
/** What `boot` needs to subscribe to metadata updates: the `event` source to hand
 *  `addListener` (the injected emitter, or `undefined` → listen over the transport)
 *  and an `enable` to start the injected DelayedEmitter (a no-op off-injection). */
interface MetadataSource {
    event?: EventSource;
    enable(): void;
}
/**
 * Resolve the metadata-update subscription source (PURE — the dual-mode decision).
 * With the injected emitter: use it and arm it, so the live path is byte-identical.
 * Without it (npm-fetched): return no `event`, so the caller's `addListener` falls
 * back to the §4 transport's `onMessage`, and `enable` is a no-op.
 */
declare const resolveMetadataSource: (injected: InjectedMetadataEmitter | null) => MetadataSource;

export { type EventSource, type InjectedMetadataEmitter, type MetadataSource, getInjectedMetadataEmitter, resolveMetadataSource };
