import * as react from 'react';
import { ReactNode } from 'react';
import { EvaluationContext } from './sandboxTypes.js';

declare class ModuleCache {
    nameResolutionPromises: Record<string, Promise<string>>;
    evaluationContextPromises: Record<string, Promise<EvaluationContext>>;
    constructor();
    private getCacheKey;
    resolveModuleName(moduleName: string, baseModule?: EvaluationContext): Promise<string>;
    getEvaluationContext(moduleName: string, baseModule?: EvaluationContext): Promise<EvaluationContext>;
}
declare const ModuleCacheContext: react.Context<ModuleCache | null>;
declare const ModuleCacheContextProvider: ({ children, moduleCache }: {
    children: ReactNode;
    moduleCache: ModuleCache;
}) => react.JSX.Element;

export { ModuleCache, ModuleCacheContext, ModuleCacheContextProvider };
