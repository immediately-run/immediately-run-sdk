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
/** Where in a file to land when opening it (R3-388). 1-indexed `line`, matching every
 *  diagnostic producer that feeds it (`tsc`, `eslint`, `BuildError`) and both VS Code
 *  and IntelliJ. A `line` past end-of-file CLAMPS to the last line rather than
 *  erroring — a diagnostic outlives the edit that shortened the file, and landing
 *  close beats refusing to navigate. */
interface EditorSelection {
    line: number;
    column?: number;
}
/** Options for {@link openInEditor} (R3-389). */
interface EditorOpenOptions {
    /** Also bring the user to the editor, ACROSS activities (TOOLS_ACTIVITY_SPEC §5.2).
     *  An app that owns the main pane (the Tools activity's runner sits where the editor
     *  would) cannot rely on the file simply becoming visible — the editor is not on
     *  screen — so this asks the host to switch to the activity that owns it.
     *
     *  This is the elevated `editor:reveal` capability, not `editor:open`: a frame
     *  without it is refused `forbidden` for the whole call (the file is NOT opened —
     *  never silently opened-without-moving). The host decides whether the user actually
     *  moves: it needs a real user gesture (a click in your frame within the last few
     *  seconds counts; a call on a timer or on run completion does not) and is
     *  rate-limited. The promise resolves the same either way, so treat a resolved
     *  reveal as "asked", not "moved", and keep a visible fallback control. Where the
     *  host owns the editor activity is host state; nothing here can name it. */
    reveal?: boolean;
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
 * Pass `{ reveal: true }` to ALSO bring the user to the editor across activities —
 * see {@link EditorOpenOptions.reveal}; that one does need the elevated
 * `editor:reveal`, and is refused outright without it.
 *
 * Older hosts ignore `selection` and open the file at its existing position, so a
 * caller may pass it unconditionally. `reveal` is only sent when true, so a host that
 * predates it sees a plain open.
 */
declare const openInEditor: (path: string, selection?: EditorSelection, opts?: EditorOpenOptions) => Promise<void>;
/**
 * Where to land when entering the edit experience (EDITOR_FIRST_EDITING_SPEC §6).
 *
 * Two target classes, and **at most one** may be given — supplying both is refused
 * `invalid-params`. Omit both to edit the current route's entry.
 *
 * - **Own-source** (`path`): a repo-relative path in the CURRENT repo. Self-scoped —
 *   the app you are already running; the host navigates within the current route,
 *   never to another repo.
 * - **Mount-file** (`file`): a file in a mount you ALREADY HOLD, opened in the main
 *   edit experience (§9, settled 2026-08-28). You can only name a mount you hold: an
 *   unheld one is `forbidden`, and indistinguishably so from one that does not exist,
 *   because an app must not be able to probe for mounts (no existence oracle).
 *   Editing a file *outside* your mounts stays picker-mediated (`pick-file`).
 *
 * A URI, a `..` segment, or a NUL is refused `invalid-params` in either class.
 */
interface EditTarget {
    /** A repo-relative working-tree path in the current repo to focus once in edit
     *  mode (e.g. `src/App.tsx`). Omit to edit the current route's entry. */
    path?: string;
    /** A file in one of YOUR OWN mounts, by the portable mount reference. `relPath` is
     *  mount-relative and leading-slash (e.g. `/notes/idea.mdx`). Mutually exclusive
     *  with {@link EditTarget.path}.
     *
     *  There is no `mode` here on purpose: writability is the HOST's live reading of
     *  the mount, not the caller's claim. A `ro` mount — which is also how an anonymous
     *  share-link viewer surfaces — is refused `read-only` at call time, before the
     *  editor is entered, so you never land in an editor that cannot save. */
    file?: {
        mountId: string;
        relPath: string;
    };
}
/** An error from {@link requestEdit}, carrying a machine-readable `.code`. */
interface RequestEditError extends Error {
    code: 'read-only' | 'forbidden' | 'invalid-params' | 'not-found' | 'no-target' | 'unknown';
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
 * Also opens a file from a mount you already hold, in the main edit experience:
 *
 *   await requestEdit({ file: { mountId: 'space:abc', relPath: '/notes/idea.mdx' } });
 *
 * Resolves once the host begins the transition; rejects with a
 * {@link RequestEditError} (`.code`). Treat `read-only`/`forbidden` as "editing is
 * not available — hide the affordance," never as an error to surface to the user.
 * `not-found` means the file is not there; nothing is created by asking to edit it.
 */
declare const requestEdit: (target?: EditTarget) => Promise<void>;
/** An error from a session intent ({@link setActiveFile} / {@link closeFile}),
 *  carrying a machine-readable `.code`. */
interface EditorSessionError extends Error {
    code: 'forbidden' | 'not-found' | 'invalid-params' | 'no-target' | 'unknown';
}
/** Switch the editor's active file to `path`, opening it (adding a tab) if it is
 *  not already open — native `setActiveFile` parity. Rejects with an
 *  {@link EditorSessionError} (`.code`) if the path is missing/invalid or this app
 *  lacks `editor:document`. */
declare const setActiveFile: (path: string) => Promise<void>;
/** Close `path`'s tab in the editor (remove it from the open set) — native
 *  `closeFile` parity. Rejects with an {@link EditorSessionError} (`.code`). */
declare const closeFile: (path: string) => Promise<void>;
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

export { type EditTarget, type EditorOpenError, type EditorOpenOptions, type EditorSelection, type EditorSessionError, type EditorWriteError, type RequestEditError, closeFile, createFile, createFolder, deleteEntry, openInEditor, renameEntry, requestEdit, setActiveFile, uploadFile };
