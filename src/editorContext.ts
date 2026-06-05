import { useEffect, useState } from 'react';

/**
 * The editor "dirty set" mirrored from the immediately.run host into the sandbox
 * (UI_AS_APPS_SPEC §5.3): which files the user has changed but not yet saved.
 *
 * This is the ELEVATED `editor:read` capability — only a system app whose binding
 * grants it (e.g. the contribute dialog) receives it. The active file and ref are
 * already available to every app via routing (`useNavigationState`), so this
 * channel carries only the genuine delta: the unsaved paths. An app without
 * `editor:read` simply sees an empty dirty set.
 */
export interface EditorContext {
  /** Repo-relative paths the user has modified but not yet saved. */
  dirtyPaths: string[];
}

interface EditorContextService {
  getContext(): EditorContext;
  onChange(listener: (context: EditorContext) => void): { dispose(): void };
}

// `module.evaluation.module.bundler.editorContext` is the sandbox bundler service
// injected into the evaluation context (same path the other SDK helpers use).
const editorContextService = (): EditorContextService => {
  // @ts-ignore - injected by the sandbox runtime
  return module.evaluation.module.bundler.editorContext;
};

/**
 * Returns the current editor context (dirty set). Poll this for a one-off read;
 * use {@link onEditorContextChange} or {@link useEditorContext} to react.
 */
export const getEditorContext = (): EditorContext => editorContextService().getContext();

/**
 * Subscribe to editor-context changes. The listener is invoked immediately with
 * the current context, then again on every change. Returns an unsubscribe fn.
 */
export const onEditorContextChange = (
  listener: (context: EditorContext) => void,
): (() => void) => {
  const disposable = editorContextService().onChange(listener);
  return () => disposable.dispose();
};

/**
 * React hook returning the current editor context (dirty set), re-rendering when
 * it changes. Handy for a contribute dialog: `const { dirtyPaths } =
 * useEditorContext()` to show "you'll save N files" before calling `contribute()`.
 */
export const useEditorContext = (): EditorContext => {
  const [context, setContext] = useState<EditorContext>(getEditorContext);
  useEffect(() => onEditorContextChange(setContext), []);
  return context;
};
