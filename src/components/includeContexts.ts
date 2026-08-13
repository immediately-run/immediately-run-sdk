import { createContext } from 'react';

import { EvaluationContext } from '../sandboxTypes';

// The contexts `<Include>` publishes and reads, in their own module so that `Include` and
// `SafeInclude` can each import them without importing each other. `Include` branches to
// `SafeInclude` and `SafeInclude` publishes `RenderExportedComponentContext`, which would be
// a cycle if either owned the contexts — and `check:circular` is a CI gate, because a
// circular SDK import once made the bundler infinite-loop.
//
// Both are re-exported from `./Include`, which is the public entry point; nothing outside
// needs to know this module exists.

/** The value exposed on {@link RenderExportedComponentContext}: the evaluation
 *  context of the module `Include` resolved. */
export type RenderFileContextType = {
  evaluationContext: EvaluationContext;
};

/** Context carrying the included module's {@link EvaluationContext} to its subtree. */
export const RenderExportedComponentContext = createContext<RenderFileContextType | null>(null);

/** Which renderer `Include` uses: `compiled` evaluates the module (the default, unchanged
 *  behaviour); `interpreted` renders the file's Markdown/MDX **as data** through the safe
 *  renderer, so no author JavaScript executes. */
export type IncludeMode = 'compiled' | 'interpreted';

/** Declare the renderer for every `Include` in a subtree. An **interpreter** app
 *  (TRUST_MODES_SPEC §5) sets this once at its root instead of remembering to pass `mode` at
 *  each call site — the failure mode being silent (one forgotten `<Include>` executes author
 *  code while the app believes it renders nothing but data). Defaults to `compiled`, so every
 *  existing consumer is unaffected. */
export const IncludeModeContext = createContext<IncludeMode>('compiled');
