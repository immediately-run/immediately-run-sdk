import { IrMarkerName } from './irMarkers.js';

interface MarkerDeps {
    send: (type: string, data?: Record<string, unknown>) => void;
    now: () => number;
}
/**
 * Forward one `ir.*` marker to the host (`ir-marker`). The host re-validates against
 * the allowlist, so a bad name/attr is dropped there; we only emit names the SDK
 * itself owns. A transport that isn't ready yet is swallowed — a missing boot mark
 * must never break the app's boot.
 */
declare function emitMarker(name: IrMarkerName, attrs?: Record<string, unknown>): void;
/** Emit a boot one-shot at most once per name (idempotent across StrictMode/re-commit). */
declare function emitMarkerOnce(name: IrMarkerName, attrs?: Record<string, unknown>): void;
/** Test seam: override the transport/clock. */
declare function __setMarkerDeps(d: Partial<MarkerDeps>): void;
/** Test seam: reset module state (the once-guard + deps) between cases. */
declare function __resetMarkers(): void;

export { __resetMarkers, __setMarkerDeps, emitMarker, emitMarkerOnce };
