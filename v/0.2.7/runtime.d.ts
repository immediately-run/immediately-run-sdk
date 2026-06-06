/** The wire protocol (postMessage envelope / channels / methods) THIS SDK speaks.
 *  Additive-only (§9); bump only for a backwards-compatible extension. */
declare const SDK_PROTOCOL_VERSION = "1.0.0";
/** This SDK's package version. Kept in step with package.json (a build step can
 *  inject it later; a constant is fine while versions are still effectively fixed). */
declare const SDK_VERSION = "0.2.7";
/** The sandbox runtime's pre-evaluation discovery global (§4). */
interface ImmediatelyRunGlobal {
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
declare function getHostRuntime(): ImmediatelyRunGlobal | null;
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

export { type ImmediatelyRunGlobal, SDK_PROTOCOL_VERSION, SDK_VERSION, type SdkHandshake, announceHandshake, getHostRuntime, sdkHandshake };
