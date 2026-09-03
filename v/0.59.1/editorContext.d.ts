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
interface EditorContext {
    /** Repo-relative paths the user has modified but not yet saved. */
    dirtyPaths: string[];
    /** Repo-relative paths currently open as tabs in the host editor (§4.2). */
    openFiles: string[];
    /**
     * The one file currently focused in the host editor (repo-relative, leading
     * slash — e.g. `/src/index.ts`), or `null` when no file is open. Distinct from
     * {@link dirtyPaths} (the unsaved SET) and {@link openFiles} (the open-tab set):
     * this is the single ACTIVE file. A baseline app reads its own active file from
     * the route, but a self-routed system panel (`drivesHostRoute=false`, e.g. the
     * file explorer) does not see the host editor's route, so it receives the active
     * file here instead (UI_AS_APPS_SPEC §5.3 self-routed-panel refinement).
     */
    activeFile: string | null;
    /**
     * The viewed-document HINT (R3-268): the working-tree file the STAGE app is
     * currently rendering (leading slash), or `null`. Distinct from
     * {@link activeFile} (the editor's focus): this is what is ON STAGE. It is an
     * app-supplied claim the host validated for existence only — consume it as a
     * highlight and nothing more (never scroll, move focus, or switch files on
     * it; that contract is what keeps the signal activation-free).
     */
    viewedFile: string | null;
}
/**
 * Returns the current editor context (dirty set). Poll this for a one-off read;
 * use {@link onEditorContextChange} or {@link useEditorContext} to react.
 */
declare const getEditorContext: () => EditorContext;
/**
 * Subscribe to editor-context changes. The listener is invoked immediately with
 * the current context, then again on every change. Returns an unsubscribe fn.
 */
declare const onEditorContextChange: (listener: (context: EditorContext) => void) => (() => void);
/**
 * React hook returning the current editor context (dirty set), re-rendering when
 * it changes. Handy for a contribute dialog: `const { dirtyPaths } =
 * useEditorContext()` to show "you'll save N files" before calling `contribute()`.
 */
declare const useEditorContext: () => EditorContext;

export { type EditorContext, getEditorContext, onEditorContextChange, useEditorContext };
