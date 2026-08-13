import * as react from 'react';
import { EvaluationContext } from '../sandboxTypes.js';
import { defaultLoadingComponent, defaultErrorComponent } from './defaults.js';
import { IncludeMode } from './includeContexts.js';
export { IncludeModeContext, RenderExportedComponentContext, RenderFileContextType } from './includeContexts.js';
import 'react-error-boundary';

/** Low-level: render one export of an already-resolving module evaluation. Most
 *  code should use {@link Include}, which resolves the module and adds Suspense. */
declare const RenderExportedComponent: ({ evaluationContextPromise, exportedSymbol, }: {
    evaluationContextPromise: Promise<EvaluationContext>;
    exportedSymbol: string;
}) => react.JSX.Element;
/** Render another repo file's exported component inline, resolving + evaluating it
 *  through the module cache (with Suspense + an error boundary).
 *
 *  Under `mode="interpreted"` (or inside an {@link IncludeModeContext} set to it) the file is
 *  instead rendered **as data** through the safe renderer — no author JavaScript executes,
 *  and the file need not be an evaluable module at all. */
declare const Include: ({ filename, exportedSymbol, LoadingComponent, ErrorComponent, baseModule, mode, components, }: {
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
}) => react.JSX.Element;

export { Include, IncludeMode, RenderExportedComponent };
