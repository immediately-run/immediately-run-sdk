import { jsx } from "react/jsx-runtime";
import { createContext } from "react";
import { addListener } from "./sandboxUtils";
class ModuleCache {
  constructor() {
    this.nameResolutionPromises = {};
    this.evaluationContextPromises = {};
    addListener("compile", () => {
    });
  }
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
const ModuleCacheContextProvider = ({ children, moduleCache }) => {
  return /* @__PURE__ */ jsx(ModuleCacheContext.Provider, { value: moduleCache, children });
};
export {
  ModuleCache,
  ModuleCacheContext,
  ModuleCacheContextProvider
};
//# sourceMappingURL=moduleCache.js.map