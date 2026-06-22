import * as react_jsx_runtime from 'react/jsx-runtime';
import * as react from 'react';
import { EvaluationContext } from '../sandboxTypes.js';
import { defaultLoadingComponent, defaultErrorComponent } from './defaults.js';
import 'react-error-boundary';

type RenderFileContextType = {
    evaluationContext: EvaluationContext;
};
declare const RenderExportedComponentContext: react.Context<RenderFileContextType | null>;
declare const RenderExportedComponent: ({ evaluationContextPromise, exportedSymbol, }: {
    evaluationContextPromise: Promise<EvaluationContext>;
    exportedSymbol: string;
}) => react_jsx_runtime.JSX.Element;
declare const Include: ({ filename, exportedSymbol, LoadingComponent, ErrorComponent, baseModule, }: {
    filename: string;
    exportedSymbol?: string;
    LoadingComponent?: typeof defaultLoadingComponent;
    ErrorComponent?: typeof defaultErrorComponent;
    baseModule?: EvaluationContext;
}) => react_jsx_runtime.JSX.Element;

export { Include, RenderExportedComponent, RenderExportedComponentContext, type RenderFileContextType };
