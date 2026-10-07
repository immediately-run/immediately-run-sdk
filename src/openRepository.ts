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
// R3-1033: an optional REVEAL rides the open — a closed chrome enum, never a destination.
// The app still cannot pass a URL, a route prefix or a path; the host decides what the
// reveal means (which surface of ITS chrome opens) and builds every URL itself. A future
// panel joins the `RepositoryReveal` union deliberately, never by a free string.
//
// Two more conditions hold on the host side, and neither is something this call can assert
// for itself: the open needs the HOST document's live transient user activation (a real
// click, which the host samples rather than believes), and one gesture opens exactly one
// tab. Both surface here as ordinary coded refusals.
import { protocolRequest } from './sandboxUtils';
import { throwOnRefusal } from './protocolRefusal';
import { PROTOCOL_OPENREPO } from './generated/protocol';
import { SCHEMES } from './protocolSchemes';

/** Where a repository lives. The same three fields a `RecentProject` carries — this is a
 *  location the user may already have navigated to under their own authority. */
export interface RepositoryCoordinates {
  provider: string;
  namespace: string;
  repository: string;
}

/** A chrome reveal that may ride an open (R3-1033) — the host's own surface to open at the
 *  destination, never a destination the app names. `'agent'` is the conversations panel;
 *  the value set is closed on purpose (see the header). */
export interface RepositoryReveal {
  panel: 'agent';
}

/** The `open` wire params — the coordinates plus the optional reveal. Typed as a named
 *  interface (not an inline literal) so the protocol-snapshot extractor resolves the wire
 *  shape from the type; see `openRepository` below. */
interface OpenRepositoryOpenParams extends RepositoryCoordinates {
  reveal?: RepositoryReveal;
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
 *  - `unknown` — the host refused without naming a code.
 *
 *  **What you actually catch.** The SDK throws a plain `Error` with `.code` assigned — a
 *  `CodedRefusalError` from `protocolRefusal.ts` — never a distinct class. These are the
 *  `.code` VALUES the host sends. Nothing enforces the union at runtime — `.code` is
 *  whatever string arrived — so treat an unlisted code as possible and `instanceof Error`
 *  as the only reliable test.
 *
 *  (This note is on the code alias rather than on the interface because the alias is where
 *  the codes are documented. Every doclink in this file names the INTERFACE, so a reader
 *  following one lands a hop away from this — a wart, not a plan. Stated without a
 *  direction on purpose: two earlier revisions of this sentence asserted a positional
 *  claim, and both were wrong.) */
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
 * `reveal` (R3-1033) optionally asks the host to open one of its own chrome surfaces at
 * the destination — a closed enum (`RepositoryReveal`), never a destination. Omitted,
 * the open lands exactly as before.
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
export async function openRepository(coordinates: RepositoryCoordinates, reveal?: RepositoryReveal): Promise<void> {
  const { provider, namespace, repository } = coordinates;
  // The reveal rides the one wire arg when the caller asked for it; a caller omitting it
  // sends no field at all (never `undefined` on the wire — the host validates what arrives).
  // Typed as OpenRepositoryOpenParams (the named interface) so the protocol-snapshot
  // extractor resolves the wire shape from the type — an intersection or a bare Record
  // would read shapeless and the check would flag a reshape that is not one.
  const params: OpenRepositoryOpenParams = { provider, namespace, repository };
  if (reveal !== undefined) params.reveal = reveal;
  const res = (await protocolRequest(SCHEMES[PROTOCOL_OPENREPO], 'open', [params])) as OpenRepositoryReply;
  throwOnRefusal(res, 'repository open refused');
}
