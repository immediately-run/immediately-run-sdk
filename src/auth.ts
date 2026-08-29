import { createPushChannel } from './pushChannel';
import { AUTH_STATE, REQUEST_AUTH_STATE } from './generated/protocol';

/**
 * Login / account state of the immediately.run user, mirrored from the host
 * window into the sandbox.
 *
 * `status` is `'unknown'` until the host has reported a value (use it to
 * distinguish "still loading" from a confirmed signed-out session).
 */
export type AuthStatus = 'unknown' | 'signed-in' | 'signed-out';

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
export interface SandboxUser {
  /** GitHub login (handle) of the signed-in user. */
  login: string;
}

/**
 * The user's login / account state: a `status` plus the `user` when signed in.
 *
 * `user` is `null` for any frame not granted `auth:identity` — even when
 * `status` is `'signed-in'`. See {@link SandboxUser} for how an app earns it.
 */
export interface AuthState {
  status: AuthStatus;
  user: SandboxUser | null;
}

const isAuthState = (v: unknown): v is AuthState => {
  const s = v as Partial<AuthState> | null;
  return (
    !!s &&
    (s.status === 'unknown' || s.status === 'signed-in' || s.status === 'signed-out') &&
    (s.user === null || (typeof s.user === 'object' && typeof (s.user as SandboxUser).login === 'string'))
  );
};

// Read over the transport (SDK_PACKAGING_SPEC §4): the host pushes `auth-state`
// and answers `request-auth-state` (wire format: site-main channelBridge.ts).
const channel = createPushChannel<AuthState>({
  pushType: AUTH_STATE,
  requestType: REQUEST_AUTH_STATE,
  initial: { status: 'unknown', user: null },
  parse: (msg) => (isAuthState(msg.state) ? (msg.state as AuthState) : undefined),
});

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
export const getAuthState = (): AuthState => channel.get();

/**
 * Subscribe to login / logout changes. The listener is invoked immediately with
 * the current state, then again on every change. Returns an unsubscribe fn.
 */
export const onAuthChange = (listener: (state: AuthState) => void): (() => void) => channel.onChange(listener);

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
export const useAuth = (): AuthState => channel.use();
