import "./chunk-VHAA22YE.js";
const scrollToId = (id) => {
  if (!id || typeof document === "undefined") return false;
  let el = null;
  try {
    el = document.getElementById(id);
    if (!el) {
      const escaped = typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(id) : id.replace(/["\\]/g, "\\$&");
      el = document.querySelector(`[data-slug="${escaped}"]`);
    }
  } catch {
    return false;
  }
  if (el && typeof el.scrollIntoView === "function") {
    el.scrollIntoView();
    return true;
  }
  return false;
};
export {
  scrollToId
};
//# sourceMappingURL=scrollToId.js.map