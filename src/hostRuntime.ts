// Runtime-discovery global (SDK_PACKAGING_SPEC §4) — a LEAF module that imports
// nothing, so it can be read by both `sandboxUtils` (transport resolver) and
// `runtime` (handshake) without forming an import cycle. `sandboxUtils → runtime`
// + `runtime → sandboxUtils` was a cycle the sandbox bundler cannot evaluate
// (infinite re-require → "Maximum call stack size exceeded"); routing the shared
// `getHostRuntime` through this leaf breaks it.

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
