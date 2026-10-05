/** Where a repository lives. The same three fields a `RecentProject` carries — this is a
 *  location the user may already have navigated to under their own authority. */
interface RepositoryCoordinates {
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
type OpenRepositoryErrorCode = 'invalid' | 'no-activation' | 'forbidden' | 'unsupported' | 'unknown';
interface OpenRepositoryError extends Error {
    code: OpenRepositoryErrorCode;
}
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
declare function openRepository(coordinates: RepositoryCoordinates): Promise<void>;

export { type OpenRepositoryError, type OpenRepositoryErrorCode, type RepositoryCoordinates, openRepository };
