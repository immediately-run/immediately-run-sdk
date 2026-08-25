// The `ir.*` load-profiling marker vocabulary + the host-side allowlist + the
// `ir.interactive` precedence rule (LOAD_PROFILING_SPEC §3/§3.1, R3-46).
//
// This module is PURE and dependency-free on purpose: the spec (§3.1) requires the
// host's vocabulary allowlist to be MIRRORED from this same definition ("additions
// to the vocabulary are spec amendments, mirrored in the host allowlist in the same
// change"). Keeping the table + validator here, with no transport/React imports,
// lets the sandbox side (this SDK) and the host (site-main, its own mirrored copy)
// share an identical contract that is unit-tested in both places.

/**
 * Each `ir.*` marker name → the attribute keys its payload may carry (the §3
 * table). A forwarded marker is accepted only if BOTH its name is defined here AND
 * every attribute key it carries is in that marker's allowed set (LP-5). An empty
 * array means "no attributes" (a bare mark).
 */
export const IR_MARKERS = {
  'ir.open': ['url', 'provider', 'ns', 'repo', 'ref', 'refKind'],
  'ir.fetch': ['source', 'bytes', 'requestCount', 'cacheHit', 'httpStatus'],
  'ir.mount': ['phantomCount', 'writablePrimed'],
  'ir.sandbox.boot': [],
  'ir.transpile': ['moduleCount', 'cacheHit', 'bytesIn', 'bytesOut'],
  'ir.deps': ['depCount', 'bytes', 'requestCount', 'cacheHit', 'cdn'],
  'ir.eval': ['moduleCount'],
  'ir.fmp': [],
  'ir.interactive': ['cold'],
  'ir.verify': ['result', 'blocking'],
  'ir.refresh': ['bytes'],
} as const;

/** A canonical `ir.*` load-profiling marker name (a key of {@link IR_MARKERS}). */
export type IrMarkerName = keyof typeof IR_MARKERS;

// Per-module / per-dep sub-marks (§3): a defined aggregate plus a `[…]` selector,
// e.g. `ir.transpile.mod[/src/App.tsx]` or `ir.deps.pkg[react@18.2.0]`. A sub-mark
// inherits its aggregate's attribute schema.
const SUBMARK_RE = /^(ir\.transpile\.mod|ir\.deps\.pkg)\[[^\]]+\]$/;
const submarkAggregate = (name: string): IrMarkerName | null =>
  name.startsWith('ir.transpile.mod') ? 'ir.transpile' : name.startsWith('ir.deps.pkg') ? 'ir.deps' : null;

/** Is `name` a defined top-level `ir.*` marker (not a sub-mark)? */
export const isIrMarkerName = (name: string): name is IrMarkerName =>
  Object.prototype.hasOwnProperty.call(IR_MARKERS, name);

/** Is `name` an accepted marker name — a defined top-level marker OR a recognized
 *  per-module/per-dep sub-mark? */
export const isAllowedMarkerName = (name: string): boolean => isIrMarkerName(name) || SUBMARK_RE.test(name);

/** A marker forwarded across the origin boundary (§3.2): a name, the sandbox-side
 *  `performance.now()` timestamp, and the optional attribute payload. */
export interface ForwardedMarker {
  name: string;
  /** Sandbox-relative timestamp (`performance.now()`) at emission (§3.2). */
  at: number;
  attrs?: Record<string, unknown>;
}

/**
 * The LP-5 vocabulary allowlist (pure). Accept a forwarded marker ONLY if its name
 * is in the vocabulary AND every attribute key is in that marker's schema. An
 * unknown name — or a defined name carrying an out-of-schema attribute key — is
 * DROPPED (returns `null`), never recorded. This is the gate against an untrusted
 * sandbox minting arbitrary names/values into the host timeline (an injection
 * surface for dashboards / the deferred RUM endpoint). Sub-marks inherit their
 * aggregate's schema.
 */
export function validateMarker(m: ForwardedMarker | null | undefined): ForwardedMarker | null {
  if (!m || typeof m.name !== 'string') return null;
  if (typeof m.at !== 'number' || !Number.isFinite(m.at)) return null;
  if (!isAllowedMarkerName(m.name)) return null;
  const base: IrMarkerName = isIrMarkerName(m.name) ? m.name : submarkAggregate(m.name)!;
  const allowed: readonly string[] = IR_MARKERS[base];
  const attrs = m.attrs;
  if (attrs !== undefined) {
    if (typeof attrs !== 'object' || attrs === null) return null;
    for (const key of Object.keys(attrs)) {
      if (!allowed.includes(key)) return null; // out-of-schema attribute → drop the whole marker
    }
  }
  return { name: m.name, at: m.at, ...(attrs !== undefined ? { attrs } : {}) };
}

/**
 * `ir.interactive = max(rootRenderCommit, reportReady)` (LP2-3). An app-called
 * `reportReady()` may only DELAY interactive — never advance it before the root
 * render commits. A `reportReady()` that fires early is recorded but takes effect
 * at the commit; if the app never reports, the commit alone stands. Budgets bind to
 * the later of the two, so an app can't game its budget by declaring itself ready
 * before it has rendered anything. PURE.
 */
export function resolveInteractive(rootRenderCommitAt: number, reportReadyAt?: number): number {
  if (reportReadyAt === undefined) return rootRenderCommitAt;
  return Math.max(rootRenderCommitAt, reportReadyAt);
}
