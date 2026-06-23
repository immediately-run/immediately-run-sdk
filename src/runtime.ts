// Runtime discovery + version handshake (SDK_PACKAGING_SPEC §4/§6).
//
// Today the SDK reaches the host through the INJECTED sandbox services
// (`module.evaluation.module.bundler.*`, see sandboxUtils). The packaging migration
// makes the SDK an app-pinnable npm dependency that finds the runtime through a
// stable, versioned global the sandbox publishes BEFORE evaluating app code:
//
//   globalThis.__immediatelyRun__ = { runtimeVersion, protocolVersion, transport }
//
// Phase 1 (behind a flag, injection still active): the SDK can READ that global
// when present (else fall back to injection), and ANNOUNCE its own version +
// protocol so the host can record + version-check it (§6/T45). The transport itself
// is unchanged here — this only wires the discovery + handshake fields so the check
// exists when app-pinned versions become real.
import { sendMessage, addListener } from './sandboxUtils';
import { SDK_VERSION } from './version';

// `getHostRuntime` + `ImmediatelyRunGlobal` live in the leaf `hostRuntime` module
// (imports nothing) and are re-exported here for a stable public API. This breaks
// the sandboxUtils↔runtime import cycle: sandboxUtils reads `getHostRuntime` from
// the leaf, while runtime still imports sandboxUtils for the handshake — one
// direction only, no cycle.
export { getHostRuntime } from './hostRuntime';
export type { ImmediatelyRunGlobal } from './hostRuntime';

/** The wire protocol (postMessage envelope / channels / methods) THIS SDK speaks.
 *  Additive-only (§9); bump only for a backwards-compatible extension. */
export const SDK_PROTOCOL_VERSION = '1.0.0';

/** This SDK's package version, baked from package.json at build (SP2-6,
 *  `scripts/gen-version.mjs`). Re-exported so the public surface is unchanged
 *  (`@immediately-run/sdk` → `SDK_VERSION`); imported above for the handshake. */
export { SDK_VERSION };

/** This SDK's handshake payload — the version + protocol the host records + checks
 *  against `HOST_PROTOCOL_VERSION` (§6/T45). */
export interface SdkHandshake {
  sdkVersion: string;
  protocolVersion: string;
}
/** Build this SDK's handshake payload (version + protocol) for the host to record. */
export const sdkHandshake = (): SdkHandshake => ({
  sdkVersion: SDK_VERSION,
  protocolVersion: SDK_PROTOCOL_VERSION,
});

/**
 * Announce this SDK's version to the host (§6). Sends `sdk-handshake` eagerly
 * (best-effort — the host may already be listening) AND replies to a host
 * `request-handshake` (the robust path, mirroring the other `request-*` pulls).
 * Idempotent; safe to call more than once. Returns an unsubscribe fn.
 */
export function announceHandshake(): () => void {
  const send = () => {
    try {
      sendMessage('sdk-handshake', sdkHandshake() as unknown as Record<string, unknown>);
    } catch {
      /* transport not ready yet — the request-handshake reply covers it */
    }
  };
  send();
  return addListener('request-handshake', send);
}
