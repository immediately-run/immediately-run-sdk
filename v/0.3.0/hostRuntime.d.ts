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
    /** Canonical `/mnt/{hash}` path of the app's own repo mount (FILE_SHARING §11.2);
     *  surfaced to apps via `getAppMountPath()`. Absent until the host reports it. */
    appMountPath?: string;
}
/**
 * Read the sandbox runtime's discovery global (§4), or null when absent — in which
 * case the SDK uses the current INJECTED path (`module.evaluation.*`). Lets the SDK
 * detect a host too old/new and fail closed (§6) once the global ships.
 */
declare function getHostRuntime(): ImmediatelyRunGlobal | null;

export { type ImmediatelyRunGlobal, getHostRuntime };
