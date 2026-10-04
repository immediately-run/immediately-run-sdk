import { protocolRequest } from './sandboxUtils';
import { throwOnRefusal, type CodedRefusalError } from './protocolRefusal';
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

/** An error from {@link openInEditor}, carrying a machine-readable `.code`.
 *
 *  **What you actually catch.** The SDK throws a plain `Error` with `.code` assigned — a
 *  `CodedRefusalError` from `protocolRefusal.ts` — never a distinct class. This interface
 *  documents the `.code` VALUES the host sends. Nothing enforces the union at runtime —
 *  `.code` is whatever string arrived — so treat an unlisted code as possible and
 *  `instanceof Error` as the only reliable test.
 */
export interface EditorOpenError extends Error {
  code:
    | 'forbidden' // the frame lacks `editor:open` (or `editor:reveal`, for a `reveal`)
    | 'not-found' // no such file in the live working tree (the host never creates)
    | 'invalid-params' // the path was empty / contained `..` / looked like a URI
    | 'no-target' // there is no host editor session to open files in
    | 'unknown';
}

type EditorResult = { ok: true; data: unknown } | { ok: false; code: string; message: string };

const editorRequest = async (method: string, arg: Record<string, unknown>): Promise<void> => {
  const res = (await protocolRequest(SCHEMES[PROTOCOL_EDITOR], method, [arg])) as EditorResult;
  try {
    throwOnRefusal(res, `editor ${method} failed`);
  } catch (e) {
    // R3-853: a `too-large` refusal may carry the host's `limitBytes` — re-attach
    // it to the thrown error (throwOnRefusal builds a code+message error only).
    // Only ever set by `upload` today; forwarded generically and harmlessly.
    const limit = (res as { limitBytes?: unknown }).limitBytes;
    if (typeof limit === 'number') (e as EditorWriteError).limitBytes = limit;
    throw e;
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

/** Options for {@link openInEditor} (R3-389). */
export interface EditorOpenOptions {
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
export const openInEditor = (path: string, selection?: EditorSelection, opts?: EditorOpenOptions): Promise<void> =>
  editorRequest('open', {
    path,
    ...(selection ? { selection } : {}),
    ...(opts?.reveal === true ? { reveal: true } : {}),
  });

/**
 * Where to land when entering the edit experience (EDITOR_FIRST_EDITING_SPEC §6).
 *
 * Three target classes, and **at most one** may be given — supplying more than one is
 * refused `invalid-params` (client-side, before anything is sent). Omit all three to
 * edit the current route's entry.
 *
 * - **Own-source** (`path`): a repo-relative path in the CURRENT repo. Self-scoped —
 *   the app you are already running; the host navigates within the current route,
 *   never to another repo.
 * - **Mount-file** (`file`): a file in a mount you ALREADY HOLD, opened in the main
 *   edit experience (§9, settled 2026-08-28). You can only name a mount you hold: an
 *   unheld one is `forbidden`, and indistinguishably so from one that does not exist,
 *   because an app must not be able to probe for mounts (no existence oracle).
 *   Editing a file *outside* your mounts stays picker-mediated (`pick-file`).
 * - **Bundle-file** (`bundleFile`, R3-876 / APP_CUSTOMIZATION_SPEC §5a): a
 *   bundle-relative path inside a directory delegated to you READ-ONLY (an opener's
 *   chroot). The host finds which of your held delegations contains it — you never
 *   name a mount — and opens the delegation's SOURCE file in the main-pane editor
 *   under the READER's authority: your chroot is never upgraded, and no delegation
 *   is minted for you. The request needs a real user gesture (transient activation,
 *   sampled on the host document) and is refused `no-activation` without one; a
 *   path outside every delegation you hold is `forbidden`, indistinguishable from a
 *   missing one.
 *
 * A URI, a `..` segment, or a NUL is refused `invalid-params` in any class.
 */
export interface EditTarget {
  /** A repo-relative working-tree path in the current repo to focus once in edit
   *  mode (e.g. `src/App.tsx`). Omit to edit the current route's entry. */
  path?: string;
  /** A file in one of YOUR OWN mounts, by the portable mount reference. `relPath` is
   *  mount-relative and leading-slash (e.g. `/notes/idea.mdx`). Mutually exclusive
   *  with {@link EditTarget.path} and {@link EditTarget.bundleFile}.
   *
   *  There is no `mode` here on purpose: writability is the HOST's live reading of
   *  the mount, not the caller's claim. A `ro` mount — which is also how an anonymous
   *  share-link viewer surfaces — is refused `read-only` at call time, before the
   *  editor is entered, so you never land in an editor that cannot save. */
  file?: { mountId: string; relPath: string };
  /** A bundle-relative, leading-slash path inside a read-only delegation you hold
   *  (R3-876 — see the class note above). Mutually exclusive with
   *  {@link EditTarget.path} and {@link EditTarget.file}. */
  bundleFile?: string;
}

/** An error from {@link requestEdit}, carrying a machine-readable `.code`.
 *
 *  **What you actually catch.** The SDK throws a plain `Error` with `.code` assigned — a
 *  `CodedRefusalError` from `protocolRefusal.ts` — never a distinct class. This interface
 *  documents the `.code` VALUES the host sends. Nothing enforces the union at runtime —
 *  `.code` is whatever string arrived — so treat an unlisted code as possible and
 *  `instanceof Error` as the only reliable test.
 */
export interface RequestEditError extends Error {
  code:
    | 'read-only' // editing isn't possible here (a `ro` mount / anonymous viewer; for `bundleFile`: the READER cannot edit the source) — HIDE the affordance
    | 'forbidden' // the host refuses: a cross-repo target, a mount you do not hold, or a `bundleFile` outside every delegation you hold
    | 'invalid-params' // the target was malformed (URI / `..` / NUL / more than one target class at once)
    | 'not-found' // the mount-file/bundle-file target does not exist — and asking did NOT create it
    | 'no-target' // there is no host editor session to enter
    | 'no-activation' // R3-876: a `bundleFile` request without transient user activation on the host document (G-CUST-11) — re-issue from a real click
    | 'cancelled' // the user dismissed an interactive host UX along the way
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
 * Also opens a file from a mount you already hold, in the main edit experience:
 *
 *   await requestEdit({ file: { mountId: 'space:abc', relPath: '/notes/idea.mdx' } });
 *
 * Resolves once the host begins the transition; rejects with a
 * {@link RequestEditError} (`.code`). Treat `read-only`/`forbidden` as "editing is
 * not available — hide the affordance," never as an error to surface to the user.
 * `not-found` means the file is not there; nothing is created by asking to edit it.
 *
 * Naming more than one target class is refused client-side (`invalid-params`),
 * before anything reaches the wire: a precedence rule is a silent reinterpretation
 * of an ambiguous request, and the one thing worse than refusing an edit target is
 * editing a different file than the caller named.
 */
export const requestEdit = (target?: EditTarget): Promise<void> => {
  const classes = [target?.path, target?.file, target?.bundleFile].filter((t) => t !== undefined).length;
  if (classes > 1) {
    // Client-side twin of the host gate's three-way rule (R3-876): refuse before
    // the wire so the ambiguous request is never in flight.
    const err = new Error('requestEdit: give at most one of `path`, `file` or `bundleFile`') as CodedRefusalError;
    err.code = 'invalid-params';
    return Promise.reject(err);
  }
  return editorRequest('requestEdit', target ? { ...target } : {});
};

// ---------------------------------------------------------------------------
// Editor SESSION management (EDITOR_AS_APP_SPEC §5.1; editor-as-app plan Phase
// 03). Unlike `openInEditor` (the explorer's cross-app intent, `editor:open`),
// these drive the editor's OWN open-tab set + active file, so they are gated by
// the editor app's `editor:document` capability — a file explorer holding only
// `editor:open` cannot call them. The host re-validates the path against the live
// working tree; the editor itself stays host-owned (§2 recursion boundary).
// ---------------------------------------------------------------------------

/** An error from a session intent ({@link setActiveFile} / {@link closeFile}),
 *  carrying a machine-readable `.code`.
 *
 *  **What you actually catch.** The SDK throws a plain `Error` with `.code` assigned — a
 *  `CodedRefusalError` from `protocolRefusal.ts` — never a distinct class. This interface
 *  documents the `.code` VALUES the host sends. Nothing enforces the union at runtime —
 *  `.code` is whatever string arrived — so treat an unlisted code as possible and
 *  `instanceof Error` as the only reliable test.
 */
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

/** An error from a working-tree mutation, carrying a machine-readable `.code`.
 *
 *  **What you actually catch.** The SDK throws a plain `Error` with `.code` assigned — a
 *  `CodedRefusalError` from `protocolRefusal.ts` — never a distinct class. This interface
 *  documents the `.code` VALUES the host sends. Nothing enforces the union at runtime —
 *  `.code` is whatever string arrived — so treat an unlisted code as possible and
 *  `instanceof Error` as the only reliable test.
 */
export interface EditorWriteError extends Error {
  /** R3-853: on a `too-large` refusal, the host's actual limit in bytes — the
   *  host names the limit (LARGE_FILE_SUPPORT §3); absent on an older host.
   *  Undefined on every other code. */
  limitBytes?: number;
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
 *  file is already there — see {@link EditorWriteError} for the full code list, which
 *  every helper below shares. */
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
 *  `too-large` past the host's size limit — the rejection carries the limit as
 *  `err.limitBytes` (R3-853: the host names the limit; absent on an older host).
 *  The bytes are transferred (zero-copy). */
export const uploadFile = (path: string, bytes: Uint8Array): Promise<void> => editorRequest('upload', { path, bytes });
