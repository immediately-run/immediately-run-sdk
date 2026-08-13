import { Suspense, use } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import { ModuleCacheContext } from '../moduleCache';
import { EvaluationContext } from '../sandboxTypes';
import { defaultErrorComponent, defaultLoadingComponent } from './defaults';
import { IncludeModeContext, RenderExportedComponentContext, type IncludeMode } from './includeContexts';
import { SafeInclude } from './SafeInclude';

// The contexts live in `./includeContexts` so `Include` and `SafeInclude` do not import each
// other (`check:circular`); re-exported here because this is the public entry point and the
// import path must not change.
export { IncludeModeContext, RenderExportedComponentContext } from './includeContexts';
export type { IncludeMode, RenderFileContextType } from './includeContexts';

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
 *  through the module cache (with Suspense + an error boundary).
 *
 *  Under `mode="interpreted"` (or inside an {@link IncludeModeContext} set to it) the file is
 *  instead rendered **as data** through the safe renderer — no author JavaScript executes,
 *  and the file need not be an evaluable module at all. */
export const Include = ({
  filename,
  exportedSymbol = 'default',
  LoadingComponent = defaultLoadingComponent,
  ErrorComponent = defaultErrorComponent,
  baseModule,
  mode,
  components,
}: {
  filename: string;
  exportedSymbol?: string;
  LoadingComponent?: typeof defaultLoadingComponent;
  ErrorComponent?: typeof defaultErrorComponent;
  baseModule?: EvaluationContext;
  /** Override {@link IncludeModeContext} for this one include. */
  mode?: IncludeMode;
  /** Interpreted mode only: components merged OVER the surrounding MDXProvider map.
   *
   *  An app's SAFE component set is not always the same as the one it hands
   *  `boot({ mdxComponents })`. Grove is the worked example: under the safe renderer it also
   *  needs sanitizing wrappers for structural tags (`main`, `section`, …), and it must NOT
   *  register those globally, because MDX consults the provider for intrinsics on the
   *  COMPILED path too — so a global registration would silently strip `style` and other
   *  non-allow-listed props from compiled authors who legitimately pass them. Ignored in
   *  compiled mode, where components come from the provider as they always have. */
  components?: Record<string, unknown>;
}) => {
  // Both contexts are read unconditionally, before the branch, so hook order is stable
  // whichever renderer this include resolves to.
  const contextMode = use(IncludeModeContext);
  const moduleCache = use(ModuleCacheContext);
  // The prop wins over the context so a single file can opt out either way: an interpreter
  // app including one trusted, executable component of its own, or a compiled app rendering
  // one file it does not trust (the shape Grove's non-executable proof page needs).
  if ((mode ?? contextMode) === 'interpreted') {
    return (
      <SafeInclude
        filename={filename}
        components={components}
        LoadingComponent={LoadingComponent}
        ErrorComponent={ErrorComponent}
      />
    );
  }
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
