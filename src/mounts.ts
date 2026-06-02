import { useEffect, useState } from 'react';

/**
 * A filesystem mount available to the sandbox, mirrored from the host window.
 *
 * Mounts appear and disappear at runtime — e.g. a Firestore-backed store is
 * mounted at `/firestore` after the user signs in and removed on logout. Read
 * or subscribe to the set, then access the files through the `fs` module at the
 * mount's `path`.
 */
export interface SandboxMount {
  /** Absolute path where the mount is reachable (e.g. `/firestore`). */
  path: string;
  /** Backend kind, e.g. `'firestore'`. */
  type: string;
  /** Optional stable identifier. */
  id?: string;
}

interface MountService {
  getMounts(): SandboxMount[];
  onChange(listener: (mounts: SandboxMount[]) => void): { dispose(): void };
}

// `module.evaluation.module.bundler` is the sandbox bundler injected into the
// evaluation context (same path the other SDK helpers reach for `messageBus`).
const mountService = (): MountService => {
  // @ts-ignore - injected by the sandbox runtime
  return module.evaluation.module.bundler.mounts;
};

/** A predicate-style matcher for {@link findMount} / {@link waitForMount}. */
export type MountQuery = { type?: string; id?: string; path?: string };

const matches = (mount: SandboxMount, query: MountQuery): boolean =>
  (query.type === undefined || mount.type === query.type) &&
  (query.id === undefined || mount.id === query.id) &&
  (query.path === undefined || mount.path === query.path);

/**
 * Returns the mounts currently available. Poll this whenever you need a one-off
 * read; use {@link onMountsChange} or {@link useMounts} to react to changes.
 */
export const getMounts = (): SandboxMount[] => mountService().getMounts();

/** Returns the first mount matching `query`, or `undefined`. */
export const findMount = (query: MountQuery): SandboxMount | undefined =>
  getMounts().find((m) => matches(m, query));

/**
 * Subscribe to mount changes. The listener is invoked immediately with the
 * current mounts, then again on every change. Returns an unsubscribe fn.
 */
export const onMountsChange = (listener: (mounts: SandboxMount[]) => void): (() => void) => {
  const disposable = mountService().onChange(listener);
  return () => disposable.dispose();
};

/**
 * Resolves once a mount matching `query` is present (immediately if it already
 * is). Handy for "use it when it appears" — e.g.
 * `await waitForMount({ type: 'firestore' })` before reading `/firestore`.
 */
export const waitForMount = (query: MountQuery): Promise<SandboxMount> =>
  new Promise((resolve) => {
    const unsubscribe = onMountsChange((mounts) => {
      const found = mounts.find((m) => matches(m, query));
      if (found) {
        // Defer unsubscribe so we don't dispose during the initial replay call.
        Promise.resolve().then(unsubscribe);
        resolve(found);
      }
    });
  });

/** React hook returning the mounts currently available, re-rendering on change. */
export const useMounts = (): SandboxMount[] => {
  const [mounts, setMounts] = useState<SandboxMount[]>(getMounts);
  useEffect(() => onMountsChange(setMounts), []);
  return mounts;
};
