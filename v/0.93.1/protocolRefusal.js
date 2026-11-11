import "./chunk-VHAA22YE.js";
function throwOnRefusal(res, fallbackMessage) {
  const r = res;
  if (r && r.ok === true) return;
  const err = new Error(typeof r?.message === "string" ? r.message : fallbackMessage);
  err.code = typeof r?.code === "string" ? r.code : "unknown";
  if (Number.isFinite(r?.retryAfter)) err.retryAfter = r.retryAfter;
  throw err;
}
export {
  throwOnRefusal
};
//# sourceMappingURL=protocolRefusal.js.map