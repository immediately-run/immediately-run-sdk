import { DirCap } from './tasks.js';

/** What to open: a bundle directory the app holds, and optionally one of its declared views. */
interface OpenBundleTarget {
    /** The bundle's directory, as the capability the app holds on it (`capDir(...)`). */
    dir: DirCap;
    /** A view the bundle's marker declares, by name. The host resolves which app shows it. */
    view?: string;
}
/** Why a bundle did not open in a tab.
 *
 *  - `invalid-params` — `dir` is not a directory capability, or `view` is not a string.
 *  - `invalid` — `view` is not a view name.
 *  - `unaddressable` — the directory is real and the app holds it, but the host has no URL
 *    for it (a space folder, a session mount). Fall back to the overlay open.
 *  - `no-activation` — no live user gesture on the host document. Call this from a click
 *    handler, with no `await` before it.
 *  - `forbidden` — the app may not open tabs, or does not hold the directory it named.
 *  - `unsupported` — this host knows the request but has no bundle-open surface wired.
 *    Fall back to the overlay open.
 *  - `timeout` — the host did not answer within {@link OPEN_BUNDLE_REPLY_TIMEOUT_MS}. That
 *    is what a host that predates this call does. Fall back to the overlay open.
 *  - `unknown` — the host refused without naming a code.
 *
 *  The SDK throws a plain `Error` with `.code` assigned; `.code` is whatever string the
 *  host sent, so treat an unlisted code as possible. */
type OpenBundleErrorCode = 'invalid-params' | 'invalid' | 'unaddressable' | 'no-activation' | 'forbidden' | 'unsupported' | 'timeout' | 'unknown';
/**
 * How long `openBundle` waits for the host's answer, in ms. A host that knows the request
 * decides it synchronously — nothing is fetched and nobody is asked — so the answer is one
 * message round trip away. A host that does not know it never answers, and a click that
 * does nothing for the default thirty seconds before falling back would read as broken.
 */
declare const OPEN_BUNDLE_REPLY_TIMEOUT_MS = 2000;
interface OpenBundleError extends Error {
    code: OpenBundleErrorCode;
}
/**
 * Ask the host to open a bundle in a new browser tab.
 *
 * Resolves once the host has performed the open; it does not wait for — and cannot observe —
 * the opened tab loading. Rejects with an {@link OpenBundleError} carrying `code` otherwise.
 * On `unaddressable`, `unsupported` or `timeout`, open the bundle the way you did before
 * this call existed: the `invokeTask` you used (`open-declared` for an app-form marker or a
 * declared view, the marker's own contract for a task-form one).
 *
 * Call it directly from a user gesture: the host samples its own transient activation when
 * the request arrives, so anything that defers the call past the gesture is refused
 * `no-activation`.
 */
declare function openBundle(target: OpenBundleTarget): Promise<void>;

export { OPEN_BUNDLE_REPLY_TIMEOUT_MS, type OpenBundleError, type OpenBundleErrorCode, type OpenBundleTarget, openBundle };
