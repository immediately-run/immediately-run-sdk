import "./chunk-VHAA22YE.js";
import { headingId } from "./_workspace/mdx-plugins.js";
function collectHeadings(body, opts = {}) {
  const sectionIds = opts.sectionIds !== false;
  const seen = /* @__PURE__ */ new Map();
  const out = [];
  let fenceMarker = null;
  for (const line of body.split("\n")) {
    const fenceMatch = /^(\s{0,3})(`{3,}|~{3,})/.exec(line);
    if (fenceMarker) {
      if (fenceMatch && line.trim().startsWith(fenceMarker)) fenceMarker = null;
      continue;
    }
    if (fenceMatch) {
      fenceMarker = fenceMatch[2][0].repeat(3);
      continue;
    }
    const h = /^(#{1,6})[ \t]+(\S.*)$/.exec(line);
    if (!h) continue;
    const text = flattenInline(h[2].trim());
    if (!text) continue;
    const baseId = headingId(text, { sectionIds });
    const n = seen.get(baseId) ?? 0;
    seen.set(baseId, n + 1);
    const id = n === 0 ? baseId : `${baseId}-${n}`;
    out.push({ id, text, depth: h[1].length });
  }
  return out;
}
function flattenInline(s) {
  return s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/`([^`]*)`/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1").replace(/__([^_]+)__/g, "$1").replace(/_([^_]+)_/g, "$1");
}
export {
  collectHeadings
};
//# sourceMappingURL=collectHeadings.js.map