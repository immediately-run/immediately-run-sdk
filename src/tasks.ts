// Task invocation — apps invoking apps (UI_AS_APPS_SPEC §5.7). The
// `startActivityForResult` pattern: one app invokes another by TASK CONTRACT
// (never by app name — the user's override picks the bound app), passes typed
// params, and awaits a typed result. The callee runs in a host-owned overlay
// under ITS OWN grants — data crosses, your authority does not (§5.7).
//
// Two roles:
//  - CALLER: `invokeTask(task, params)` (Recipe B — a deferred reply the host
//    holds open until the callee finishes). Delegate a file with `capFile(...)`:
//    the host resolves it against YOUR grants and mints an attenuated chroot.
//  - CALLEE: read `useTaskInput()`, then `completeTask(result)` / `cancelTask()`.
import { useEffect, useState } from 'react';
import { protocolRequest, sendMessage, addListener } from './sandboxUtils';
import { TASK_CANCEL, TASK_COMPLETE, TASK_INPUT } from './generated/protocol';

// ── caller side ─────────────────────────────────────────────────────────────

/** A delegated FILE capability marker for a task param (§5.7). */
export interface FileCap {
  $cap: 'file';
  mountId: string;
  relPath: string;
  mode: 'ro' | 'rw';
}

/**
 * Build a delegated file reference for a task param. The host resolves it against
 * YOUR OWN grants and mints an attenuated, task-scoped chroot for the callee — you
 * can only delegate a path you already hold (attenuation only, never escalation).
 *
 *   file: capFile({ mountId: 'space:abc', relPath: 'photos/cat.jpg' }, { mode: 'rw' })
 */
export const capFile = (
  ref: { mountId: string; relPath: string },
  opts: { mode: 'ro' | 'rw' },
): FileCap => ({ $cap: 'file', mountId: ref.mountId, relPath: ref.relPath, mode: opts.mode });

/** A delegated DIRECTORY capability marker for a task param (D2). Like {@link FileCap}
 *  but `relPath` names a DIRECTORY: the host chroots the callee AT that directory
 *  (the whole subtree). Used for the `pick-file` `roots` — one chroot per root. */
export interface DirCap {
  $cap: 'dir';
  mountId: string;
  relPath: string;
  mode: 'ro' | 'rw';
}

/**
 * Build a delegated DIRECTORY reference for a task param (the directory analogue of
 * {@link capFile}). The host resolves it against YOUR OWN grants and mints an
 * attenuated, task-scoped chroot of that directory for the callee — you can only
 * delegate a directory you already hold (attenuation only, never escalation):
 *
 *   roots: [capDir({ mountId: 'space:abc', relPath: 'boards' }, { mode: 'rw' })]
 */
export const capDir = (
  ref: { mountId: string; relPath: string },
  opts: { mode: 'ro' | 'rw' },
): DirCap => ({ $cap: 'dir', mountId: ref.mountId, relPath: ref.relPath, mode: opts.mode });

/**
 * Invoke another app via a task contract and await its typed result (Recipe B).
 * Rejects with a machine `.code` on refusal: `cancelled` (user dismissed the
 * overlay), `timeout` (§5.7.1 liveness), `forbidden` (undeclared task or a file
 * delegation you don't hold), `no-such-task`, `task-cycle`/`task-depth-exceeded`/
 * `task-version-mismatch`, or `invalid-params` (result failed the contract schema).
 */
export const invokeTask = async <R = unknown>(
  task: string,
  params: Record<string, unknown> = {},
): Promise<R> => {
  const res = (await protocolRequest('task', 'invoke', [{ task, params }])) as
    | { ok: true; data: R }
    | { ok: false; code?: string; message?: string }
    | undefined;
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? `task '${task}' failed`) as Error & { code?: string };
    err.code = res?.code ?? 'unknown';
    throw err;
  }
  return res.data;
};

// ── callee side ─────────────────────────────────────────────────────────────

/** The params this app was invoked with as a task callee. */
export interface TaskInput {
  task: string;
  params: Record<string, unknown>;
}

let latestInput: TaskInput | null = null;
const inputListeners = new Set<(i: TaskInput) => void>();

// The host delivers a `task-input` message to the callee's iframe right after it
// mounts the overlay (the §5.7 "params via the region's mount event").
addListener(TASK_INPUT, (m: { task: string; params?: Record<string, unknown> }) => {
  latestInput = { task: m.task, params: m.params ?? {} };
  inputListeners.forEach((l) => l(latestInput!));
});

/** The task params this app was invoked with, or null if it isn't a task callee. */
export const getTaskInput = (): TaskInput | null => latestInput;

/**
 * Finish the task, returning a result to the caller. The host validates it against
 * the contract's result schema before resolving the caller (`invalid-params` on
 * violation), then tears down this overlay.
 */
export const completeTask = (result: unknown): void => sendMessage(TASK_COMPLETE, { result });

/** Abort the task; the caller's `invokeTask` rejects with `cancelled`. */
export const cancelTask = (): void => sendMessage(TASK_CANCEL, {});

/** React hook: the task input for this callee, re-rendering when it arrives. */
export const useTaskInput = (): TaskInput | null => {
  const [input, setInput] = useState<TaskInput | null>(getTaskInput);
  useEffect(() => {
    const l = (i: TaskInput) => setInput(i);
    inputListeners.add(l);
    if (latestInput) setInput(latestInput);
    return () => {
      inputListeners.delete(l);
    };
  }, []);
  return input;
};
