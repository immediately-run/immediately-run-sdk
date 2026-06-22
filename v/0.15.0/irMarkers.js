const IR_MARKERS = {
  "ir.open": ["url", "provider", "ns", "repo", "ref", "refKind"],
  "ir.fetch": ["source", "bytes", "requestCount", "cacheHit", "httpStatus"],
  "ir.mount": ["phantomCount", "writablePrimed"],
  "ir.sandbox.boot": [],
  "ir.transpile": ["moduleCount", "cacheHit", "bytesIn", "bytesOut"],
  "ir.deps": ["depCount", "bytes", "requestCount", "cacheHit", "cdn"],
  "ir.eval": ["moduleCount"],
  "ir.fmp": [],
  "ir.interactive": ["cold"],
  "ir.verify": ["result", "blocking"],
  "ir.refresh": ["bytes"]
};
const SUBMARK_RE = /^(ir\.transpile\.mod|ir\.deps\.pkg)\[[^\]]+\]$/;
const submarkAggregate = (name) => name.startsWith("ir.transpile.mod") ? "ir.transpile" : name.startsWith("ir.deps.pkg") ? "ir.deps" : null;
const isIrMarkerName = (name) => Object.prototype.hasOwnProperty.call(IR_MARKERS, name);
const isAllowedMarkerName = (name) => isIrMarkerName(name) || SUBMARK_RE.test(name);
function validateMarker(m) {
  if (!m || typeof m.name !== "string") return null;
  if (typeof m.at !== "number" || !Number.isFinite(m.at)) return null;
  if (!isAllowedMarkerName(m.name)) return null;
  const base = isIrMarkerName(m.name) ? m.name : submarkAggregate(m.name);
  const allowed = IR_MARKERS[base];
  const attrs = m.attrs;
  if (attrs !== void 0) {
    if (typeof attrs !== "object" || attrs === null) return null;
    for (const key of Object.keys(attrs)) {
      if (!allowed.includes(key)) return null;
    }
  }
  return { name: m.name, at: m.at, ...attrs !== void 0 ? { attrs } : {} };
}
function resolveInteractive(rootRenderCommitAt, reportReadyAt) {
  if (reportReadyAt === void 0) return rootRenderCommitAt;
  return Math.max(rootRenderCommitAt, reportReadyAt);
}
export {
  IR_MARKERS,
  isAllowedMarkerName,
  isIrMarkerName,
  resolveInteractive,
  validateMarker
};
//# sourceMappingURL=irMarkers.js.map