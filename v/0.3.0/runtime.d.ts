export { ImmediatelyRunGlobal, getHostRuntime } from './hostRuntime.js';

/** The wire protocol (postMessage envelope / channels / methods) THIS SDK speaks.
 *  Additive-only (§9); bump only for a backwards-compatible extension. */
declare const SDK_PROTOCOL_VERSION = "1.0.0";
/** This SDK's package version. Kept in step with package.json (a build step can
 *  inject it later; a constant is fine while versions are still effectively fixed). */
declare const SDK_VERSION = "0.3.0";
/** This SDK's handshake payload — the version + protocol the host records + checks
 *  against `HOST_PROTOCOL_VERSION` (§6/T45). */
interface SdkHandshake {
    sdkVersion: string;
    protocolVersion: string;
}
declare const sdkHandshake: () => SdkHandshake;
/**
 * Announce this SDK's version to the host (§6). Sends `sdk-handshake` eagerly
 * (best-effort — the host may already be listening) AND replies to a host
 * `request-handshake` (the robust path, mirroring the other `request-*` pulls).
 * Idempotent; safe to call more than once. Returns an unsubscribe fn.
 */
declare function announceHandshake(): () => void;

export { SDK_PROTOCOL_VERSION, SDK_VERSION, type SdkHandshake, announceHandshake, sdkHandshake };
