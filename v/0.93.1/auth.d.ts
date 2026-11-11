/**
 * Login / account state of the immediately.run user, mirrored from the host
 * window into the sandbox.
 *
 * `status` is `'unknown'` until the host has reported a value (use it to
 * distinguish "still loading" from a confirmed signed-out session).
 */
type AuthStatus = 'unknown' | 'signed-in' | 'signed-out';
/**
 * The signed-in immediately.run user, as seen by the sandbox (no token, ever).
 *
 * Identity is gated by the `auth:identity` capability (elevated): the host
 * redacts `user` to `null` for any frame not holding it, while the baseline
 * `auth:status` still reports whether *a* session exists. A stage app therefore
 * sees `{ status: 'signed-in', user: null }` unless it declares `auth:identity`
 * under `immediately.run.capabilities` in its `package.json` and the user
 * consents once (a durable per-(app, user) grant). First-party / elevated
 * frames receive it via their region binding.
 */
interface SandboxUser {
    /** GitHub login (handle) of the signed-in user. */
    login: string;
}
/**
 * The user's login / account state: a `status` plus the `user` when signed in.
 *
 * `user` is `null` for any frame not granted `auth:identity` — even when
 * `status` is `'signed-in'`. See {@link SandboxUser} for how an app earns it.
 */
interface AuthState {
    status: AuthStatus;
    user: SandboxUser | null;
}
/**
 * Returns the current login / account state. Poll this whenever you need a
 * one-off read; use {@link onAuthChange} or {@link useAuth} to react to changes.
 *
 * `user` is `null` unless this frame holds `auth:identity` (see
 * {@link SandboxUser}); `status` alone is baseline and always available.
 *
 * Off-host (plain `vite dev` — no host to report a session) `status` stays
 * `'unknown'` FOREVER — it never settles to `'signed-out'`. Code that waits for a
 * settled status before proceeding (e.g. attributing authorship) hangs locally:
 * gate such flows on `status === 'signed-in'` combined with a timeout or an
 * explicit local fallback, never on "status is no longer 'unknown'".
 */
declare const getAuthState: () => AuthState;
/**
 * Subscribe to login / logout changes. The listener is invoked immediately with
 * the current state, then again on every change. Returns an unsubscribe fn.
 */
declare const onAuthChange: (listener: (state: AuthState) => void) => (() => void);
/**
 * React hook returning the current login / account state, re-rendering on
 * login / logout.
 *
 * `user` is `null` unless this frame holds `auth:identity` (see
 * {@link SandboxUser}); `status` alone is baseline and always available.
 *
 * Off-host (plain `vite dev`) `status` stays `'unknown'` forever — see
 * {@link getAuthState} for why "wait until it settles" hangs locally and how to
 * gate on it safely (signed-in check plus a timeout/fallback).
 */
declare const useAuth: () => AuthState;

export { type AuthState, type AuthStatus, type SandboxUser, getAuthState, onAuthChange, useAuth };
