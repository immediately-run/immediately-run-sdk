import { useEffect, useState } from 'react';

/**
 * Login / account state of the immediately.run user, mirrored from the host
 * window into the sandbox.
 *
 * `status` is `'unknown'` until the host has reported a value (use it to
 * distinguish "still loading" from a confirmed signed-out session).
 */
export type AuthStatus = 'unknown' | 'signed-in' | 'signed-out';

export interface SandboxUser {
  /** GitHub login (handle) of the signed-in user. */
  login: string;
}

export interface AuthState {
  status: AuthStatus;
  user: SandboxUser | null;
}

interface AuthService {
  getState(): AuthState;
  onChange(listener: (state: AuthState) => void): { dispose(): void };
}

// `module.evaluation.module.bundler` is the sandbox bundler injected into the
// evaluation context (same path the other SDK helpers reach for `messageBus`).
const authService = (): AuthService => {
  // @ts-ignore - injected by the sandbox runtime
  return module.evaluation.module.bundler.auth;
};

/**
 * Returns the current login / account state. Poll this whenever you need a
 * one-off read; use {@link onAuthChange} or {@link useAuth} to react to changes.
 */
export const getAuthState = (): AuthState => authService().getState();

/**
 * Subscribe to login / logout changes. The listener is invoked immediately with
 * the current state, then again on every change. Returns an unsubscribe fn.
 */
export const onAuthChange = (listener: (state: AuthState) => void): (() => void) => {
  const disposable = authService().onChange(listener);
  return () => disposable.dispose();
};

/**
 * React hook returning the current login / account state, re-rendering on
 * login / logout.
 */
export const useAuth = (): AuthState => {
  const [state, setState] = useState<AuthState>(getAuthState);
  useEffect(() => onAuthChange(setState), []);
  return state;
};
