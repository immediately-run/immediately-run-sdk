import * as react from 'react';
import { EvaluationContext } from '../sandboxTypes.js';

/** The value exposed on {@link RenderExportedComponentContext}: the evaluation
 *  context of the module `Include` resolved. */
type RenderFileContextType = {
    evaluationContext: EvaluationContext;
};
/** Context carrying the included module's {@link EvaluationContext} to its subtree. */
declare const RenderExportedComponentContext: react.Context<RenderFileContextType | null>;
/** Which renderer `Include` uses: `compiled` evaluates the module (the default, unchanged
 *  behaviour); `interpreted` renders the file's Markdown/MDX **as data** through the safe
 *  renderer, so no author JavaScript executes. */
type IncludeMode = 'compiled' | 'interpreted';
/** Declare the renderer for every `Include` in a subtree. An **interpreter** app
 *  (TRUST_MODES_SPEC §5) sets this once at its root instead of remembering to pass `mode` at
 *  each call site — the failure mode being silent (one forgotten `<Include>` executes author
 *  code while the app believes it renders nothing but data). Defaults to `compiled`, so every
 *  existing consumer is unaffected. */
declare const IncludeModeContext: react.Context<IncludeMode>;

export { type IncludeMode, IncludeModeContext, RenderExportedComponentContext, type RenderFileContextType };
