import { Suspense, createContext, use } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import { ModuleCacheContext } from '../moduleCache';
import { EvaluationContext } from '../sandboxTypes';
import { defaultErrorComponent, defaultLoadingComponent } from './defaults';

/** The value exposed on {@link RenderExportedComponentContext}: the evaluation
 *  context of the module {@link Include} resolved. */
export type RenderFileContextType = {
  evaluationContext: EvaluationContext;
};

/** Context carrying the included module's {@link EvaluationContext} to its subtree. */
export const RenderExportedComponentContext = createContext<RenderFileContextType | null>(null);

/** Low-level: render one export of an already-resolving module evaluation. Most
 *  code should use {@link Include}, which resolves the module and adds Suspense. */
export const RenderExportedComponent = ({
  evaluationContextPromise,
  exportedSymbol = 'default',
}: {
  evaluationContextPromise: Promise<EvaluationContext>;
  exportedSymbol: string;
}) => {
  const evaluationContext = use(evaluationContextPromise);
  // TODO: handle case where exported symbol not found.
  const Component = exportedSymbol === '*' ? evaluationContext.exports : evaluationContext.exports[exportedSymbol];
  return (
    <RenderExportedComponentContext value={{ evaluationContext }}>
      <Component />
    </RenderExportedComponentContext>
  );
};

/** Render another repo file's exported component inline, resolving + evaluating it
 *  through the module cache (with Suspense + an error boundary). */
export const Include = ({
  filename,
  exportedSymbol = 'default',
  LoadingComponent = defaultLoadingComponent,
  ErrorComponent = defaultErrorComponent,
  baseModule,
}: {
  filename: string;
  exportedSymbol?: string;
  LoadingComponent?: typeof defaultLoadingComponent;
  ErrorComponent?: typeof defaultErrorComponent;
  baseModule?: EvaluationContext;
}) => {
  const moduleCache = use(ModuleCacheContext);
  // @ts-ignore
  const evaluationContextPromise = moduleCache!.getEvaluationContext(filename, baseModule ?? module);
  return (
    <ErrorBoundary fallbackRender={ErrorComponent}>
      <Suspense fallback={<LoadingComponent />}>
        <RenderExportedComponent evaluationContextPromise={evaluationContextPromise} exportedSymbol={exportedSymbol} />
      </Suspense>
    </ErrorBoundary>
  );
};
