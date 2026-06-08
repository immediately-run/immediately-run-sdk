import { protocolRequest } from './sandboxUtils';

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

type EditorResult =
  | { ok: true; data: unknown }
  | { ok: false; code: string; message: string };

/**
 * Ask the host to open `path` (a repo-relative working-tree path, e.g. `src/App.tsx`
 * or `/src/App.tsx`) in the editor. Resolves once the editor switches to it; rejects
 * with an {@link EditorOpenError} (`.code`) if the path is invalid, missing, or this
 * app may not open files.
 */
export const openInEditor = async (path: string): Promise<void> => {
  const res = (await protocolRequest('editor', 'open', [{ path }])) as EditorResult;
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? 'open failed') as EditorOpenError;
    err.code = (res?.code as EditorOpenError['code']) ?? 'unknown';
    throw err;
  }
};
