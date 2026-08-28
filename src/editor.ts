import { protocolRequest } from './sandboxUtils';
import { SCHEMES } from './protocolSchemes';
import { PROTOCOL_EDITOR } from './generated/protocol';

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
export interface EditorOpenError extends Error {
  code:
    | 'forbidden' // the frame lacks `editor:open`
    | 'not-found' // no such file in the live working tree (the host never creates)
    | 'invalid-params' // the path was empty / contained `..` / looked like a URI
    | 'no-target' // there is no host editor session to open files in
    | 'unknown';
}

type EditorResult = { ok: true; data: unknown } | { ok: false; code: string; message: string };

const editorRequest = async (method: string, arg: Record<string, unknown>): Promise<void> => {
  const res = (await protocolRequest(SCHEMES[PROTOCOL_EDITOR], method, [arg])) as EditorResult;
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? `editor ${method} failed`) as EditorWriteError;
    err.code = (res?.code as EditorWriteError['code']) ?? 'unknown';
    throw err;
  }
};

/** Where in a file to land when opening it (R3-388). 1-indexed `line`, matching every
 *  diagnostic producer that feeds it (`tsc`, `eslint`, `BuildError`) and both VS Code
 *  and IntelliJ. A `line` past end-of-file CLAMPS to the last line rather than
 *  erroring — a diagnostic outlives the edit that shortened the file, and landing
 *  close beats refusing to navigate. */
export interface EditorSelection {
  line: number;
  column?: number;
}

/**
 * Ask the host to open `path` (a repo-relative working-tree path, e.g. `src/App.tsx`
 * or `/src/App.tsx`) in the editor. Resolves once the editor switches to it; rejects
 * with an {@link EditorOpenError} (`.code`) if the path is invalid, missing, or this
 * app may not open files.
 *
 * Pass `selection` to land the caret on a specific line — what a problems list needs
 * to make a diagnostic clickable. It widens nothing: a selection says where to look
 * inside a file the caller could already open, and the capability is unchanged
 * (`editor:open`).
 *
 * Older hosts ignore the extra field and open the file at its existing position, so
 * a caller may pass it unconditionally.
 */
export const openInEditor = (path: string, selection?: EditorSelection): Promise<void> =>
  editorRequest('open', selection ? { path, selection } : { path });

/**
 * Where to land when entering the edit experience (EDITOR_FIRST_EDITING_SPEC §6
 * Delta A). v1 supports only an optional repo-relative `path` in the CURRENT repo
 * (self-scoped — the app you are already running; the host navigates within the
 * current route, never to another repo). A URI or `..` path is refused
 * `invalid-params`. Editing a file in one of your *mounts* (a space) is the
 * `edit-file` task, not this.
 */
export interface EditTarget {
  /** A repo-relative working-tree path in the current repo to focus once in edit
   *  mode (e.g. `src/App.tsx`). Omit to edit the current route's entry. */
  path?: string;
}

/** An error from {@link requestEdit}, carrying a machine-readable `.code`. */
export interface RequestEditError extends Error {
  code:
    | 'read-only' // editing isn't possible here (a `ro` mount / anonymous viewer) — HIDE the affordance
    | 'forbidden' // the host refuses (e.g. a cross-repo / out-of-scope target)
    | 'invalid-params' // the target was malformed (URI / `..` / a non-current repo)
    | 'no-target' // there is no host editor session to enter
    | 'unknown';
}

/**
 * Ask the host to enter the **edit experience** for the app you are running —
 * the present→edit transition (`/present/...` → `/edit/...`) an app cannot make
 * itself. This is an INTENT (§2 recursion boundary): the app asks, the HOST
 * performs the visible, user-observable navigation and draws all editor chrome;
 * the app never navigates or paints chrome.
 *
 * Use it to offer an "edit this" affordance from a run/present-mode app that opens
 * the app's own source in the platform editor — instead of shipping a bespoke
 * in-app editor (EDITOR_FIRST_EDITING_SPEC §1).
 *
 * Resolves once the host begins the transition; rejects with a
 * {@link RequestEditError} (`.code`). Treat `read-only`/`forbidden` as "editing is
 * not available — hide the affordance," never as an error to surface to the user.
 */
export const requestEdit = (target?: EditTarget): Promise<void> =>
  editorRequest('requestEdit', target ? { ...target } : {});

// ---------------------------------------------------------------------------
// Editor SESSION management (EDITOR_AS_APP_SPEC §5.1; editor-as-app plan Phase
// 03). Unlike `openInEditor` (the explorer's cross-app intent, `editor:open`),
// these drive the editor's OWN open-tab set + active file, so they are gated by
// the editor app's `editor:document` capability — a file explorer holding only
// `editor:open` cannot call them. The host re-validates the path against the live
// working tree; the editor itself stays host-owned (§2 recursion boundary).
// ---------------------------------------------------------------------------

/** An error from a session intent ({@link setActiveFile} / {@link closeFile}),
 *  carrying a machine-readable `.code`. */
export interface EditorSessionError extends Error {
  code:
    | 'forbidden' // the frame lacks `editor:document`
    | 'not-found' // no such file in the live working tree
    | 'invalid-params' // the path was empty / contained `..` / looked like a URI
    | 'no-target' // there is no host editor session
    | 'unknown';
}

/** Switch the editor's active file to `path`, opening it (adding a tab) if it is
 *  not already open — native `setActiveFile` parity. Rejects with an
 *  {@link EditorSessionError} (`.code`) if the path is missing/invalid or this app
 *  lacks `editor:document`. */
export const setActiveFile = (path: string): Promise<void> => editorRequest('setActive', { path });

/** Close `path`'s tab in the editor (remove it from the open set) — native
 *  `closeFile` parity. Rejects with an {@link EditorSessionError} (`.code`). */
export const closeFile = (path: string): Promise<void> => editorRequest('close', { path });

// ---------------------------------------------------------------------------
// Working-tree mutation (UI_AS_APPS_SPEC §4 / EDITOR_AS_APP_SPEC §5.2). The file
// explorer NAMES a working-tree path and the HOST performs the COW write (and
// refreshes the preview) — the app holds no write port; it asks. Gated by the
// first-party `editor:write` capability, so only a first-party chrome app (the
// file explorer) can call these; anyone else is refused at the gate.
// ---------------------------------------------------------------------------

/** An error from a working-tree mutation, carrying a machine-readable `.code`. */
export interface EditorWriteError extends Error {
  code:
    | 'forbidden' // the frame lacks `editor:write` (first-party-only)
    | 'not-found' // the target file/folder does not exist (delete/rename)
    | 'exists' // the target already exists (create/rename would clobber)
    | 'protected' // the host refuses to delete this file (e.g. package.json)
    | 'too-large' // an upload exceeds the host's size limit
    | 'invalid-params' // a path was empty / contained `..` / looked like a URI
    | 'no-target' // there is no host editor session
    | 'unknown';
}

/** Create an empty working-tree file at `path` and open it. Rejects `exists` if a
 *  file is already there. */
export const createFile = (path: string): Promise<void> => editorRequest('createFile', { path });

/** Create a working-tree folder at `path` (materialised with a `.gitkeep`). */
export const createFolder = (path: string): Promise<void> => editorRequest('createFolder', { path });

/** Delete a working-tree file, or a folder and everything under it. Rejects
 *  `protected` for files the host won't remove, `not-found` if absent. */
export const deleteEntry = (path: string): Promise<void> => editorRequest('deleteEntry', { path });

/** Rename/move a working-tree file from `from` to `to`. Rejects `exists` if `to`
 *  is taken, `not-found` if `from` is absent. */
export const renameEntry = (from: string, to: string): Promise<void> => editorRequest('rename', { from, to });

/** Upload binary/text `bytes` to a working-tree file at `path`. Rejects
 *  `too-large` past the host's size limit. The bytes are transferred (zero-copy). */
export const uploadFile = (path: string, bytes: Uint8Array): Promise<void> => editorRequest('upload', { path, bytes });
