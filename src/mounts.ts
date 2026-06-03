import { useEffect, useState } from 'react';
import { protocolRequest } from './sandboxUtils';

/**
 * A filesystem mount available to the sandbox, mirrored from the host window.
 *
 * Mounts appear on demand — call {@link openAppSpace} / {@link mountSpace} to ask
 * the host to mount a Firestore-backed "space"; it appears at `/spaces/{id}`.
 * Read or subscribe to the set, then access the files through the `fs` module at
 * the mount's `path`.
 */
export interface SandboxMount {
  /** Absolute path where the mount is reachable (e.g. `/spaces/{id}`). */
  path: string;
  /** Backend kind, e.g. `'firestore'`. */
  type: string;
  /** Optional stable identifier (the spaceId, for spaces). */
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

// ---------------------------------------------------------------------------
// Spaces — on-demand, shareable Firestore-backed filesystems.
// The host owns all UX: if you aren't signed in, or the space doesn't exist or
// isn't accessible, the parent window presents sign-in / create / request-access
// and only then resolves these calls. See docs/specs/FILE_SHARING_SPEC.md.
// ---------------------------------------------------------------------------

/** Summary of a space, as returned by {@link listSpaces}. */
export interface SpaceInfo {
  spaceId: string;
  role?: 'owner' | 'writer' | 'reader';
  owner?: string;
  name?: string;
}

/** An error from a space operation, carrying a machine-readable `code`. */
export interface SpaceError extends Error {
  code: 'auth-required' | 'cancelled' | 'forbidden' | 'not-found' | 'unknown';
}

type SpaceResult =
  | { ok: true; data: unknown }
  | { ok: false; code: string; message: string };

const request = async (method: string, query: Record<string, unknown> = {}): Promise<unknown> => {
  const res = (await protocolRequest('spaces', method, [query])) as SpaceResult;
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? 'space request failed') as SpaceError;
    err.code = (res?.code as SpaceError['code']) ?? 'unknown';
    throw err;
  }
  return res.data;
};

// The host announces the mount (`mount-add`) separately from the protocol reply,
// so wait until the ZenFS port mount is actually registered before returning —
// otherwise an immediate read could race the mount.
const awaitReady = (descriptor: SandboxMount): Promise<SandboxMount> =>
  waitForMount({ id: descriptor.id ?? descriptor.path });

/**
 * Open this app's workspace for the signed-in user (the zero-config path). The
 * `slot` names which workspace (default `'default'`); pass distinct slots for
 * multiple filesystems in one app. On a missing slot the host shows a
 * create-or-pick dialog. Rejects with a {@link SpaceError} (`.code`) on cancel.
 */
export const openAppSpace = async (slot = 'default'): Promise<SandboxMount> =>
  awaitReady((await request('open', { slot })) as SandboxMount);

/** Mount a specific space by id (e.g. one shared with you, or from a link). */
export const mountSpace = async (query: { spaceId: string }): Promise<SandboxMount> =>
  awaitReady((await request('mount', query)) as SandboxMount);

/** Create a brand-new space, optionally binding it to this app (a slot). */
export const createSpace = async (
  opts: { name?: string; slot?: string; bindToApp?: boolean } = {}
): Promise<SandboxMount> => awaitReady((await request('create', opts)) as SandboxMount);

/** List spaces you can access — all of them, or just those bound to this app. */
export const listSpaces = async (opts: { app?: boolean } = {}): Promise<SpaceInfo[]> =>
  (await request('list', opts)) as SpaceInfo[];

/** Release a mounted space (stops its listener on the host). */
export const unmountSpace = async (query: { spaceId: string }): Promise<void> => {
  await request('unmount', query);
};
