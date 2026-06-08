/**
 * Open a working-tree file in the immediately.run host editor (UI_AS_APPS_SPEC §4 —
 * the file explorer's click-to-open). This is an INTENT: the app asks, the HOST
 * validates the path and drives the CodeMirror editor — the editor itself stays
 * host-owned (§2 recursion boundary), so an app can never own or script it beyond
 * "please show this file".
 *
 * Requires the elevated `editor:open` capability — a previewed app does not hold it
 * (it must not move the host's focus), so only a system app whose binding grants it
 * (the file explorer) can call this; anyone else is refused at the gate.
 */
/** An error from {@link openInEditor}, carrying a machine-readable `.code`. */
interface EditorOpenError extends Error {
    code: 'forbidden' | 'not-found' | 'invalid-params' | 'no-target' | 'unknown';
}
/**
 * Ask the host to open `path` (a repo-relative working-tree path, e.g. `src/App.tsx`
 * or `/src/App.tsx`) in the editor. Resolves once the editor switches to it; rejects
 * with an {@link EditorOpenError} (`.code`) if the path is invalid, missing, or this
 * app may not open files.
 */
declare const openInEditor: (path: string) => Promise<void>;

export { type EditorOpenError, openInEditor };
