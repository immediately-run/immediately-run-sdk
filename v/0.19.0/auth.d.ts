/**
 * Login / account state of the immediately.run user, mirrored from the host
 * window into the sandbox.
 *
 * `status` is `'unknown'` until the host has reported a value (use it to
 * distinguish "still loading" from a confirmed signed-out session).
 */
type AuthStatus = 'unknown' | 'signed-in' | 'signed-out';
/** The signed-in immediately.run user, as seen by the sandbox (no token, ever). */
interface SandboxUser {
    /** GitHub login (handle) of the signed-in user. */
    login: string;
}
/** The user's login / account state: a `status` plus the `user` when signed in. */
interface AuthState {
    status: AuthStatus;
    user: SandboxUser | null;
}
/**
 * Returns the current login / account state. Poll this whenever you need a
 * one-off read; use {@link onAuthChange} or {@link useAuth} to react to changes.
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
 */
declare const useAuth: () => AuthState;

export { type AuthState, type AuthStatus, type SandboxUser, getAuthState, onAuthChange, useAuth };
