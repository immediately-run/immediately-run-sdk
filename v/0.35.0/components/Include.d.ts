import * as react from 'react';
import { EvaluationContext } from '../sandboxTypes.js';
import { defaultLoadingComponent, defaultErrorComponent } from './defaults.js';
import 'react-error-boundary';

/** The value exposed on {@link RenderExportedComponentContext}: the evaluation
 *  context of the module {@link Include} resolved. */
type RenderFileContextType = {
    evaluationContext: EvaluationContext;
};
/** Context carrying the included module's {@link EvaluationContext} to its subtree. */
declare const RenderExportedComponentContext: react.Context<RenderFileContextType | null>;
/** Low-level: render one export of an already-resolving module evaluation. Most
 *  code should use {@link Include}, which resolves the module and adds Suspense. */
declare const RenderExportedComponent: ({ evaluationContextPromise, exportedSymbol, }: {
    evaluationContextPromise: Promise<EvaluationContext>;
    exportedSymbol: string;
}) => react.JSX.Element;
/** Render another repo file's exported component inline, resolving + evaluating it
 *  through the module cache (with Suspense + an error boundary). */
declare const Include: ({ filename, exportedSymbol, LoadingComponent, ErrorComponent, baseModule, }: {
    filename: string;
    exportedSymbol?: string;
    LoadingComponent?: typeof defaultLoadingComponent;
    ErrorComponent?: typeof defaultErrorComponent;
    baseModule?: EvaluationContext;
}) => react.JSX.Element;

export { Include, RenderExportedComponent, RenderExportedComponentContext, type RenderFileContextType };
