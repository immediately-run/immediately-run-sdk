import "./chunk-VHAA22YE.js";
function ensureStyleElement(id, text, options = {}) {
  if (typeof document === "undefined") return;
  if (document.getElementById(id)) return;
  const el = document.createElement("style");
  el.id = id;
  el.textContent = text;
  if (options.first) document.head.prepend(el);
  else document.head.appendChild(el);
}
export {
  ensureStyleElement
};
//# sourceMappingURL=styleElement.js.map