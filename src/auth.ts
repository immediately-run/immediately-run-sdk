import { createPushChannel } from './pushChannel';

/**
 * Login / account state of the immediately.run user, mirrored from the host
 * window into the sandbox.
 *
 * `status` is `'unknown'` until the host has reported a value (use it to
 * distinguish "still loading" from a confirmed signed-out session).
 */
export type AuthStatus = 'unknown' | 'signed-in' | 'signed-out';

/** The signed-in immediately.run user, as seen by the sandbox (no token, ever). */
export interface SandboxUser {
  /** GitHub login (handle) of the signed-in user. */
  login: string;
}

/** The user's login / account state: a `status` plus the `user` when signed in. */
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
  pushType: 'auth-state',
  requestType: 'request-auth-state',
  initial: { status: 'unknown', user: null },
  parse: (msg) => (isAuthState(msg.state) ? (msg.state as AuthState) : undefined),
});

/**
 * Returns the current login / account state. Poll this whenever you need a
 * one-off read; use {@link onAuthChange} or {@link useAuth} to react to changes.
 */
export const getAuthState = (): AuthState => channel.get();

/**
 * Subscribe to login / logout changes. The listener is invoked immediately with
 * the current state, then again on every change. Returns an unsubscribe fn.
 */
export const onAuthChange = (listener: (state: AuthState) => void): (() => void) =>
  channel.onChange(listener);

/**
 * React hook returning the current login / account state, re-rendering on
 * login / logout.
 */
export const useAuth = (): AuthState => channel.use();
