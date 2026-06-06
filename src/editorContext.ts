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
}

// Read over the transport (SDK_PACKAGING_SPEC §4): the host pushes `editor-context`
// and answers `request-editor-context` — but only for a frame holding `editor:read`
// (gated by the channel router). An app without it gets no reply, so the empty
// default below stands. Wire format: site-main channelBridge.ts.
const channel = createPushChannel<EditorContext>({
  pushType: 'editor-context',
  requestType: 'request-editor-context',
  initial: { dirtyPaths: [] },
  parse: (msg) =>
    Array.isArray(msg.dirtyPaths) && msg.dirtyPaths.every((p) => typeof p === 'string')
      ? { dirtyPaths: msg.dirtyPaths as string[] }
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
