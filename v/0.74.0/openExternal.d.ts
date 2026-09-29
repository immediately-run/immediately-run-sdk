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
type OpenExternalErrorCode = 'invalid' | 'no-activation' | 'declined' | 'forbidden' | 'unsupported' | 'unknown';
interface OpenExternalError extends Error {
    code: OpenExternalErrorCode;
}
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
declare function openExternal(url: string): Promise<void>;

export { type OpenExternalError, type OpenExternalErrorCode, openExternal };
