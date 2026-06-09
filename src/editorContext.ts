import { createPushChannel } from './pushChannel';

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
}

// Read over the transport (SDK_PACKAGING_SPEC §4): the host pushes `editor-context`
// and answers `request-editor-context` — but only for a frame holding `editor:read`
// (gated by the channel router). An app without it gets no reply, so the empty
// default below stands. Wire format: site-main channelBridge.ts.
const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((p) => typeof p === 'string');

const channel = createPushChannel<EditorContext>({
  pushType: 'editor-context',
  requestType: 'request-editor-context',
  initial: { dirtyPaths: [], openFiles: [], activeFile: null },
  parse: (msg) =>
    isStringArray(msg.dirtyPaths)
      ? {
          dirtyPaths: msg.dirtyPaths,
          // `openFiles` is newer than `dirtyPaths`; tolerate an older host that
          // omits it (defensive SDK — defaults to empty rather than rejecting).
          openFiles: isStringArray(msg.openFiles) ? msg.openFiles : [],
          // `activeFile` is newer still; an older host that omits it (or sends a
          // non-string) reads as `null` — no file highlighted, never a throw.
          activeFile: typeof msg.activeFile === 'string' ? msg.activeFile : null,
        }
      : undefined,
});

/**
 * Returns the current editor context (dirty set). Poll this for a one-off read;
 * use {@link onEditorContextChange} or {@link useEditorContext} to react.
 */
export const getEditorContext = (): EditorContext => channel.get();

/**
 * Subscribe to editor-context changes. The listener is invoked immediately with
 * the current context, then again on every change. Returns an unsubscribe fn.
 */
export const onEditorContextChange = (listener: (context: EditorContext) => void): (() => void) =>
  channel.onChange(listener);

/**
 * React hook returning the current editor context (dirty set), re-rendering when
 * it changes. Handy for a contribute dialog: `const { dirtyPaths } =
 * useEditorContext()` to show "you'll save N files" before calling `contribute()`.
 */
export const useEditorContext = (): EditorContext => channel.use();
