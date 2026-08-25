// Injected sandbox-bundler access (SDK_PACKAGING_SPEC §4/§8, Phase 5). The SDK was
// historically wired straight to the injected bundler service objects
// (`module.evaluation.module.bundler.<x>`). Phase 5 makes the SDK transport-agnostic
// so those services can eventually be retired: every reader PREFERS the injection
// (so the current, live path stays byte-for-byte unchanged) and FALLS BACK to the
// §4 transport when the SDK is fetched from npm with no injection present.
//
// This module centralizes the `module.evaluation.module.bundler.*` reads (the same
// philosophy as `sandboxUtils`' transport resolver) and exposes a PURE resolver for
// the metadata-update subscription so the dual-mode decision is unit-tested without
// a live bundler. The ambient reads themselves are thin (untestable without the
// sandbox realm, exactly like `sandboxUtils.transport()`).

/** vscode-style Event source: subscribe with a listener, get a disposable back. */
export type EventSource = (listener: (msg: any) => void) => { dispose(): void };

/** The injected bundler's metadata emitter — fires `{type:'metadata-update', update}`
 *  as files (re)compile. Absent when the SDK is npm-fetched (no injection). */
export interface InjectedMetadataEmitter {
  onMetadataChange: EventSource;
  /** Start the DelayedEmitter once a subscriber is attached (injected path only). */
  enable(): void;
}

/** The injected bundler object, or null when there is no injection (npm-fetched). */
const injectedBundler = (): any | null => {
  try {
    // @ts-ignore - `module.evaluation` is injected by the sandbox runtime
    return module?.evaluation?.module?.bundler ?? null;
  } catch {
    return null;
  }
};

/** The injected bundler's metadata emitter, or null when npm-fetched. */
export const getInjectedMetadataEmitter = (): InjectedMetadataEmitter | null => {
  const b = injectedBundler();
  if (b && typeof b.onMetadataChange === 'function' && b.onMetadataChangeEmitter) {
    return {
      onMetadataChange: b.onMetadataChange,
      enable: () => b.onMetadataChangeEmitter.enable(),
    };
  }
  return null;
};

/**
 * The injected bundler's synchronous metadata snapshot for the boot seed
 * (MDX_CONTENT_COLLECTIONS_SPEC §1.4). Returns the full `/app`-keyed collection the
 * bundler seeded (from the frontmatter sidecar) so the app's first render already
 * holds it — the SDK-side counterpart of the bundler seeding. Null when npm-fetched
 * (no in-realm bundler) → the SDK degrades to event-fill over the §4 transport, no
 * first-paint guarantee. The returned VALUE refs are the same objects the emitter
 * replays, so the `enable()` replay is a no-op (the §1.4 identity contract).
 */
export const getInjectedMetadataSnapshot = (): Record<string, Record<string, any>> | null => {
  const b = injectedBundler();
  if (b && typeof b.getMetadataSnapshot === 'function') {
    return b.getMetadataSnapshot();
  }
  return null;
};

/** What `boot` needs to subscribe to metadata updates: the `event` source to hand
 *  `addListener` (the injected emitter, or `undefined` → listen over the transport)
 *  and an `enable` to start the injected DelayedEmitter (a no-op off-injection). */
export interface MetadataSource {
  event?: EventSource;
  enable(): void;
}

/**
 * Resolve the metadata-update subscription source (PURE — the dual-mode decision).
 * With the injected emitter: use it and arm it, so the live path is byte-identical.
 * Without it (npm-fetched): return no `event`, so the caller's `addListener` falls
 * back to the §4 transport's `onMessage`, and `enable` is a no-op.
 */
export const resolveMetadataSource = (injected: InjectedMetadataEmitter | null): MetadataSource =>
  injected
    ? { event: injected.onMetadataChange, enable: () => injected.enable() }
    : { event: undefined, enable: () => {} };
