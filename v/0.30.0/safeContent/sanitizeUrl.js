const SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;
const ALLOWED_SCHEMES = /* @__PURE__ */ new Set(["http", "https", "mailto"]);
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;
function sanitizeUrl(url) {
  if (typeof url !== "string") return void 0;
  const cleaned = url.replace(CONTROL_CHARS, "").trim();
  if (cleaned === "") return void 0;
  const m = SCHEME.exec(cleaned);
  if (!m) return cleaned;
  return ALLOWED_SCHEMES.has(m[1].toLowerCase()) ? cleaned : void 0;
}
export {
  sanitizeUrl
};
//# sourceMappingURL=sanitizeUrl.js.map