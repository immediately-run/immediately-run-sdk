// Host-mediated "open this repository in a new tab" (R3-476).
//
// An app frame cannot open a first-party tab itself. A `window.open` from inside the
// sandboxed frame inherits the sandbox — the opened tab runs at the same opaque origin and
// cannot load the host — and `target="_top"` would replace the app's own frame rather than
// open a tab. So the app asks the host, and the host performs the open from its own context.
//
// The app names COORDINATES and nothing else. It cannot pass a URL, a route prefix or a
// path: the host builds the destination from its own route grammar, so this call can only
// ever reach one of the platform's own repository routes. That is the point of the shape —
// an app that could spell the destination could open anything.
//
// Two more conditions hold on the host side, and neither is something this call can assert
// for itself: the open needs the HOST document's live transient user activation (a real
// click, which the host samples rather than believes), and one gesture opens exactly one
// tab. Both surface here as ordinary coded refusals.
import { protocolRequest } from './sandboxUtils';
import { PROTOCOL_OPENREPO } from './generated/protocol';
import { SCHEMES } from './protocolSchemes';

/** Where a repository lives. The same three fields a `RecentProject` carries — this is a
 *  location the user may already have navigated to under their own authority. */
export interface RepositoryCoordinates {
  provider: string;
  namespace: string;
  repository: string;
}

/** Why the host refused to open a tab.
 *
 *  - `invalid` — the coordinates are not three clean path segments.
 *  - `no-activation` — no live user gesture on the host document. Call this from a click
 *    handler; a timer or a boot path will always get this. A SECOND call inside one gesture
 *    also lands here: `window.open` consumes the host's transient activation, so one click
 *    buys exactly one tab and the next needs a real second click.
 *  - `forbidden` — the app does not hold the baseline `route:read` capability.
 *  - `unsupported` — this host has no repository-open surface wired.
 *  - `unknown` — the host refused without naming a code. */
export type OpenRepositoryErrorCode = 'invalid' | 'no-activation' | 'forbidden' | 'unsupported' | 'unknown';

export interface OpenRepositoryError extends Error {
  code: OpenRepositoryErrorCode;
}

/** The host's reply: the envelope resolves INSIDE the promise, so a refusal is a resolved
 *  `{ ok: false }` rather than a rejection at the transport layer. */
type OpenRepositoryReply = { ok: true; url?: string } | { ok: false; code?: string; message?: string };

/**
 * Ask the host to open a repository in a new browser tab.
 *
 * Resolves once the host has performed the open; it does not wait for — and cannot observe —
 * the opened tab loading. Rejects with a typed {@link OpenRepositoryError} carrying `code`
 * when the host refuses.
 *
 * Call it directly from a user gesture. The host samples its own transient activation when
 * the request arrives, so anything that defers the call past the gesture (an `await` before
 * it, a `setTimeout`, a retry) will be refused `no-activation`. None of the refusals are
 * worth retrying: each names a condition a retry cannot change.
 */
export async function openRepository(coordinates: RepositoryCoordinates): Promise<void> {
  const { provider, namespace, repository } = coordinates;
  const res = (await protocolRequest(SCHEMES[PROTOCOL_OPENREPO], 'open', [
    { provider, namespace, repository },
  ])) as OpenRepositoryReply;
  // The refusal resolves inside the reply, so `res.ok !== true` is the only failure test
  // there is — a bare-promise shape here would swallow every coded refusal as a success.
  if (!res || res.ok !== true) {
    const err = new Error(
      (res && 'message' in res ? res.message : undefined) ?? 'repository open refused',
    ) as OpenRepositoryError;
    err.code = ((res && 'code' in res ? res.code : undefined) as OpenRepositoryErrorCode) ?? 'unknown';
    throw err;
  }
}
