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
/** An error from a working-tree mutation, carrying a machine-readable `.code`. */
interface EditorWriteError extends Error {
    code: 'forbidden' | 'not-found' | 'exists' | 'protected' | 'too-large' | 'invalid-params' | 'no-target' | 'unknown';
}
/** Create an empty working-tree file at `path` and open it. Rejects `exists` if a
 *  file is already there. */
declare const createFile: (path: string) => Promise<void>;
/** Create a working-tree folder at `path` (materialised with a `.gitkeep`). */
declare const createFolder: (path: string) => Promise<void>;
/** Delete a working-tree file, or a folder and everything under it. Rejects
 *  `protected` for files the host won't remove, `not-found` if absent. */
declare const deleteEntry: (path: string) => Promise<void>;
/** Rename/move a working-tree file from `from` to `to`. Rejects `exists` if `to`
 *  is taken, `not-found` if `from` is absent. */
declare const renameEntry: (from: string, to: string) => Promise<void>;
/** Upload binary/text `bytes` to a working-tree file at `path`. Rejects
 *  `too-large` past the host's size limit. The bytes are transferred (zero-copy). */
declare const uploadFile: (path: string, bytes: Uint8Array) => Promise<void>;

export { type EditorOpenError, type EditorWriteError, createFile, createFolder, deleteEntry, openInEditor, renameEntry, uploadFile };
