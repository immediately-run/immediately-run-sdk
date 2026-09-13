// Host-mediated "open this external link in a new tab" (R3-619).
//
// An app frame cannot open an ordinary top-level tab itself for a destination that has to
// act as itself: a `window.open` or `<a target="_blank">` from inside the sandboxed frame
// inherits the sandbox (`allow-popups` without `allow-popups-to-escape-sandbox`), so the
// opened tab runs at the same opaque origin and anything that signs in or posts fails.
//
// Unlike `openRepository`, the app here names a URL, not coordinates — the destination is
// arbitrary, not a platform route. So the host validates the URL and confirms every call
// (the full destination in its own chrome, opened only on the user's click). The app never
// receives a `Window` handle; it asks, and the host decides whether and how to open.
//
// The same two host-side conditions as `openRepository` hold, and neither is something this
// call can assert for itself: the confirmation needs the HOST document's live transient
// user activation (a real click, which the host samples rather than believes), and the
// confirmation must not consume that activation before the open. Both surface here as
// ordinary coded refusals.
import { protocolRequest } from './sandboxUtils';
import { PROTOCOL_OPENLINK } from './generated/protocol';
import { SCHEMES } from './protocolSchemes';

/** Why the host refused to open the link.
 *
 *  - `invalid` — the URL is not a clean `https:` external destination (scheme, credentials,
 *    length, or the host's own origin).
 *  - `no-activation` — no live user gesture on the host document. Call this from a click
 *    handler; a timer or a boot path will always get this.
 *  - `declined` — the host showed the confirmation and the user did not confirm.
 *  - `forbidden` — the app does not hold the baseline `link:open` capability.
 *  - `unsupported` — this host has no outward-link surface wired (an older host).
 *  - `unknown` — the host refused without naming a code. */
export type OpenExternalErrorCode = 'invalid' | 'no-activation' | 'declined' | 'forbidden' | 'unsupported' | 'unknown';

export interface OpenExternalError extends Error {
  code: OpenExternalErrorCode;
}

/** The host's reply: the envelope resolves inside the promise, so a refusal is a resolved
 *  `{ ok: false }` rather than a rejection at the transport layer. */
type OpenExternalReply = { ok: true; url?: string } | { ok: false; code?: string; message?: string };

/**
 * Ask the host to open an external link in a new browser tab.
 *
 * Resolves once the host has performed the open; it does not wait for — and cannot observe —
 * the opened tab loading. Rejects with a typed {@link OpenExternalError} carrying `code` when
 * the host refuses.
 *
 * Call it directly from a user gesture. The host samples its own transient activation when
 * the request arrives, so anything that defers the call past the gesture (an `await` before
 * it, a `setTimeout`, a retry) will be refused `no-activation`. None of the refusals are
 * worth retrying: each names a condition a retry cannot change.
 */
export async function openExternal(url: string): Promise<void> {
  const res = (await protocolRequest(SCHEMES[PROTOCOL_OPENLINK], 'open', [{ url }])) as OpenExternalReply;
  // The refusal resolves inside the reply, so `res.ok !== true` is the only failure test
  // there is — a bare-promise shape here would swallow every coded refusal as a success.
  if (!res || res.ok !== true) {
    const err = new Error(
      (res && 'message' in res ? res.message : undefined) ?? 'external link open refused',
    ) as OpenExternalError;
    err.code = ((res && 'code' in res ? res.code : undefined) as OpenExternalErrorCode) ?? 'unknown';
    throw err;
  }
}
