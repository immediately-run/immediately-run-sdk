import "./chunk-VHAA22YE.js";
import { jsx } from "react/jsx-runtime";
import { createContext } from "react";
import { addListener } from "./sandboxUtils.js";
import { COMPILE } from "./generated/protocol.js";
class ModuleCache {
  constructor() {
    this.nameResolutionPromises = {};
    this.evaluationContextPromises = {};
    addListener(COMPILE, () => {
    });
  }
  // PROMISE-IDENTITY INVARIANT (the app-frame Suspense replay; pinned by
  // src/boot.suspenseReplay.test.tsx): the promise returned by
  // `getEvaluationContext` for a given key must be THE SAME promise for the
  // whole realm boot. `Include` hands it straight to React's `use()` — a new
  // identity for the same key mid-session re-suspends the boundary and REPLAYS
  // every effect under it while the component instance, refs, DOM and
  // in-flight promise chains survive (the Suspense hide/reveal signature). The
  // invariant holds because the cache lives for the whole boot (one instance
  // per `boot()` call), entries are never evicted (the compile seam above
  // stays disabled), and the key — base-module filepath + module name — is
  // stable for a stable URL. Any change that lets the same key answer a fresh
  // promise (eviction, a scoped compile reset, a re-created cache) re-opens
  // the replay, and the named test then fails loudly.
  getCacheKey(mod, moduleName) {
    return `${mod.evaluation.module.filepath}|${moduleName}`;
  }
  resolveModuleName(moduleName, baseModule) {
    const mod = baseModule ?? module;
    const cacheKey = this.getCacheKey(mod, moduleName);
    if (!(cacheKey in this.nameResolutionPromises)) {
      this.nameResolutionPromises[cacheKey] = mod.resolve(moduleName);
    }
    return this.nameResolutionPromises[cacheKey];
  }
  getEvaluationContext(moduleName, baseModule) {
    const mod = baseModule ?? module;
    const cacheKey = this.getCacheKey(mod, moduleName);
    if (!(cacheKey in this.evaluationContextPromises)) {
      this.evaluationContextPromises[cacheKey] = mod.getModuleEvaluationContext(moduleName);
    }
    return this.evaluationContextPromises[cacheKey];
  }
}
const ModuleCacheContext = createContext(null);
const ModuleCacheContextProvider = ({
  children,
  moduleCache
}) => {
  return /* @__PURE__ */ jsx(ModuleCacheContext.Provider, { value: moduleCache, children });
};
export {
  ModuleCache,
  ModuleCacheContext,
  ModuleCacheContextProvider
};
//# sourceMappingURL=moduleCache.js.map