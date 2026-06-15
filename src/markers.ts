// Runtime emission of the boot `ir.*` markers (LOAD_PROFILING_SPEC §3/§3.2, R3-46).
//
// The host already MERGED the receive end: it validates a forwarded
// `{ type:'ir-marker', name, at, attrs? }` against the LP-5 allowlist
// (`irMarkers.ts`) and brackets request→interactive, treating an accepted
// `ir.interactive` as the root-render-commit signal (site-main
// `routePerfMessage`/`perfTimeline`). This module is the SANDBOX-side emitter for
// the boot marks the SDK owns — `ir.fmp` (first meaningful paint) and
// `ir.interactive` (root render commit) — forwarded over the same transport as
// `reportReady()` (`ready.ts`). The per-marker timestamp is the sandbox-relative
// `performance.now()` at emission (§3.2).
//
// Mirrors `ready.ts`'s dependency seam so the emission is unit-testable without a
// host transport, and is idempotent per name so React StrictMode's double-invoke
// (or any re-commit) can't mint a boot mark twice.
import { sendMessage as defaultSend } from './sandboxUtils';
import { isIrMarkerName, type IrMarkerName } from './irMarkers';

interface MarkerDeps {
  send: (type: string, data?: Record<string, unknown>) => void;
  now: () => number;
}

const realNow = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

const defaultDeps: MarkerDeps = { send: defaultSend, now: realNow };

let deps: MarkerDeps = defaultDeps;
const emitted = new Set<string>();

/**
 * Forward one `ir.*` marker to the host (`ir-marker`). The host re-validates against
 * the allowlist, so a bad name/attr is dropped there; we only emit names the SDK
 * itself owns. A transport that isn't ready yet is swallowed — a missing boot mark
 * must never break the app's boot.
 */
export function emitMarker(name: IrMarkerName, attrs?: Record<string, unknown>): void {
  if (!isIrMarkerName(name)) return;
  try {
    deps.send('ir-marker', { name, at: deps.now(), ...(attrs !== undefined ? { attrs } : {}) });
  } catch {
    /* transport not ready — boot continues; the host simply lacks this mark */
  }
}

/** Emit a boot one-shot at most once per name (idempotent across StrictMode/re-commit). */
export function emitMarkerOnce(name: IrMarkerName, attrs?: Record<string, unknown>): void {
  if (emitted.has(name)) return;
  emitted.add(name);
  emitMarker(name, attrs);
}

/** Test seam: override the transport/clock. */
export function __setMarkerDeps(d: Partial<MarkerDeps>): void {
  deps = { ...defaultDeps, ...d };
}

/** Test seam: reset module state (the once-guard + deps) between cases. */
export function __resetMarkers(): void {
  deps = defaultDeps;
  emitted.clear();
}
