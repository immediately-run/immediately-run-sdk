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

/** The wire protocol (postMessage envelope / channels / methods) THIS SDK speaks.
 *  Additive-only (§9); bump only for a backwards-compatible extension. */
export const SDK_PROTOCOL_VERSION = '1.0.0';

/** This SDK's package version. Kept in step with package.json (a build step can
 *  inject it later; a constant is fine while versions are still effectively fixed). */
export const SDK_VERSION = '0.2.7';

/** The sandbox runtime's pre-evaluation discovery global (§4). */
export interface ImmediatelyRunGlobal {
  /** Sandbox-runtime protocol version (semver). */
  runtimeVersion?: string;
  /** postMessage envelope/protocol version. */
  protocolVersion?: string;
  /** The host channel the SDK talks over (MessagePort | message bus). */
  transport?: unknown;
  /** Resolves when ports arrive, if they arrive async after register-frame. */
  ready?: Promise<void>;
}

/**
 * Read the sandbox runtime's discovery global (§4), or null when absent — in which
 * case the SDK uses the current INJECTED path (`module.evaluation.*`). Lets the SDK
 * detect a host too old/new and fail closed (§6) once the global ships.
 */
export function getHostRuntime(): ImmediatelyRunGlobal | null {
  try {
    return (globalThis as { __immediatelyRun__?: ImmediatelyRunGlobal }).__immediatelyRun__ ?? null;
  } catch {
    return null;
  }
}

/** This SDK's handshake payload — the version + protocol the host records + checks
 *  against `HOST_PROTOCOL_VERSION` (§6/T45). */
export interface SdkHandshake {
  sdkVersion: string;
  protocolVersion: string;
}
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
