import "./chunk-VHAA22YE.js";
function createSourceCache(reader) {
  const cache = /* @__PURE__ */ new Map();
  return {
    read(path) {
      const hit = cache.get(path);
      if (hit) return hit;
      const p = reader(path).catch((error) => {
        if (cache.get(path) === p) cache.delete(path);
        throw error;
      });
      cache.set(path, p);
      return p;
    },
    invalidate(path) {
      if (path === void 0) cache.clear();
      else cache.delete(path);
    },
    size: () => cache.size
  };
}
export {
  createSourceCache
};
//# sourceMappingURL=sourceCache.js.map