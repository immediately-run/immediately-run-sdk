// Host-mediated "open this bundle in its own tab" (BUNDLE_EMBEDDING_SPEC §4b.9).
//
// Opening a bundle is not a for-result task: the reader stays, the view wants the whole
// screen, and the bundle's files are what they work on next. So a file manager's
// "Open as …" asks the host for a new tab — an ordinary session of the opener over the
// bundle, starting in present mode — instead of the task overlay.
//
// The app names the DIRECTORY it already holds, as the same capability it would hand a
// task, and optionally a declared view by NAME. It cannot pass a URL, a route or an app:
// the host maps the capability to a location it can address, builds the destination from
// its own route grammar, and the opened tab re-reads the bundle's marker and resolves the
// opener itself. The link grants nothing.
//
// Not every directory has an address. A folder in a space, or on a session mount, cannot
// be named by a URL today; the host refuses those with `unaddressable`, and the caller
// keeps its overlay open (`invokeTask`) as the fallback.
//
// As with `openRepository`, the open needs the HOST document's live transient user
// activation, which the host samples rather than believes.
import { protocolRequest } from './sandboxUtils';
import { throwOnRefusal } from './protocolRefusal';
import { PROTOCOL_OPENBUNDLE } from './generated/protocol';
import { SCHEMES } from './protocolSchemes';
import type { DirCap } from './tasks';

/** What to open: a bundle directory the app holds, and optionally one of its declared views. */
export interface OpenBundleTarget {
  /** The bundle's directory, as the capability the app holds on it (`capDir(...)`). */
  dir: DirCap;
  /** A view the bundle's marker declares, by name. The host resolves which app shows it. */
  view?: string;
}

/** Why the host refused to open a tab.
 *
 *  - `invalid` — `dir` is not a directory capability, or `view` is not a view name.
 *  - `unaddressable` — the directory is real and the app holds it, but the host has no URL
 *    for it (a space folder, a session mount). Fall back to the overlay open.
 *  - `no-activation` — no live user gesture on the host document. Call this from a click
 *    handler, with no `await` before it.
 *  - `forbidden` — the app may not open tabs, or does not hold the directory it named.
 *  - `unsupported` — this host has no bundle-open surface wired (an older host).
 *  - `unknown` — the host refused without naming a code.
 *
 *  The SDK throws a plain `Error` with `.code` assigned; `.code` is whatever string the
 *  host sent, so treat an unlisted code as possible. */
export type OpenBundleErrorCode =
  | 'invalid'
  | 'unaddressable'
  | 'no-activation'
  | 'forbidden'
  | 'unsupported'
  | 'unknown';

export interface OpenBundleError extends Error {
  code: OpenBundleErrorCode;
}

/** The wire params: the capability and the view name, and nothing else. */
interface OpenBundleParams {
  dir: DirCap;
  view?: string;
}

/** The host's reply: a refusal is a resolved `{ ok: false }`, not a transport rejection. */
type OpenBundleReply = { ok: true } | { ok: false; code?: string; message?: string };

/**
 * Ask the host to open a bundle in a new browser tab, in present mode.
 *
 * Resolves once the host has performed the open; it does not wait for — and cannot observe —
 * the opened tab loading. Rejects with an {@link OpenBundleError} carrying `code` when the
 * host refuses. On `unaddressable` (and on `unsupported`, from a host that predates this
 * call) open the bundle the way you did before: `invokeTask('open-declared', …)`.
 *
 * Call it directly from a user gesture: the host samples its own transient activation when
 * the request arrives, so anything that defers the call past the gesture is refused
 * `no-activation`.
 */
export async function openBundle(target: OpenBundleTarget): Promise<void> {
  const { $cap, mountId, relPath, mode } = target.dir;
  const params: OpenBundleParams = { dir: { $cap, mountId, relPath, mode } };
  if (target.view !== undefined) params.view = target.view;
  const res = (await protocolRequest(SCHEMES[PROTOCOL_OPENBUNDLE], 'open', [params])) as OpenBundleReply;
  throwOnRefusal(res, 'bundle open refused');
}
