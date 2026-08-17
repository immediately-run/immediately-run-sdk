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
/**
 * The injected bundler's synchronous metadata snapshot for the boot seed
 * (MDX_CONTENT_COLLECTIONS_SPEC §1.4). Returns the full `/app`-keyed collection the
 * bundler seeded (from the frontmatter sidecar) so the app's first render already
 * holds it — the SDK-side counterpart of the bundler seeding. Null when npm-fetched
 * (no in-realm bundler) → the SDK degrades to event-fill over the §4 transport, no
 * first-paint guarantee. The returned VALUE refs are the same objects the emitter
 * replays, so the `enable()` replay is a no-op (the §1.4 identity contract).
 */
declare const getInjectedMetadataSnapshot: () => Record<string, Record<string, any>> | null;
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

export { type EventSource, type InjectedMetadataEmitter, type MetadataSource, getInjectedMetadataEmitter, getInjectedMetadataSnapshot, resolveMetadataSource };
