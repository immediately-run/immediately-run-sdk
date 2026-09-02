// based on: https://www.bbss.dev/posts/react-learn-suspense/#fetchcache-provider

import { createContext, ReactNode } from 'react';
import { EvaluationContext } from './sandboxTypes';
import { addListener } from './sandboxUtils';
import { COMPILE } from './generated/protocol';

export class ModuleCache {
  nameResolutionPromises: Record<string, Promise<string>> = {};
  evaluationContextPromises: Record<string, Promise<EvaluationContext>> = {};

  constructor() {
    // A compile-time cache reset, deliberately NOT performed. Resetting here
    // replaced every <Include>'s module-evaluation-context promise with a new
    // promise for the same value on EVERY compilation, including compilations that
    // do not affect that module, so the component lost its state for nothing. The
    // listener stays registered (and the reset stays here, disabled) because the
    // fix is to scope the reset to the modules a compile actually changed, not to
    // drop the seam.
    addListener(COMPILE, () => {
      // this.nameResolutionPromises = {};
      // this.evaluationContextPromises = {};
    });
  }

  private getCacheKey(mod: EvaluationContext, moduleName: string): string {
    return `${mod.evaluation.module.filepath}|${moduleName}`;
  }

  resolveModuleName(moduleName: string, baseModule?: EvaluationContext): Promise<string> {
    // note: uses current module as base module if none specified by caller
    // @ts-ignore
    const mod = baseModule ?? (module as EvaluationContext);
    const cacheKey = this.getCacheKey(mod, moduleName);
    if (!(cacheKey in this.nameResolutionPromises)) {
      this.nameResolutionPromises[cacheKey] = mod.resolve(moduleName);
    }
    return this.nameResolutionPromises[cacheKey];
  }

  getEvaluationContext(moduleName: string, baseModule?: EvaluationContext): Promise<EvaluationContext> {
    // note: uses current module as base module if none specified by caller
    // @ts-ignore
    const mod = baseModule ?? (module as EvaluationContext);
    const cacheKey = this.getCacheKey(mod, moduleName);
    if (!(cacheKey in this.evaluationContextPromises)) {
      this.evaluationContextPromises[cacheKey] = mod.getModuleEvaluationContext(moduleName);
    }
    return this.evaluationContextPromises[cacheKey];
  }
}

export const ModuleCacheContext = createContext<null | ModuleCache>(null);

export const ModuleCacheContextProvider = ({
  children,
  moduleCache,
}: {
  children: ReactNode;
  moduleCache: ModuleCache;
}) => {
  return <ModuleCacheContext.Provider value={moduleCache}>{children}</ModuleCacheContext.Provider>;
};
