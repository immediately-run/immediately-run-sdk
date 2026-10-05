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
