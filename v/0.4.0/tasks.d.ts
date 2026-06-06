/** A delegated FILE capability marker for a task param (§5.7). */
interface FileCap {
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
declare const capFile: (ref: {
    mountId: string;
    relPath: string;
}, opts: {
    mode: "ro" | "rw";
}) => FileCap;
/**
 * Invoke another app via a task contract and await its typed result (Recipe B).
 * Rejects with a machine `.code` on refusal: `cancelled` (user dismissed the
 * overlay), `timeout` (§5.7.1 liveness), `forbidden` (undeclared task or a file
 * delegation you don't hold), `no-such-task`, `task-cycle`/`task-depth-exceeded`/
 * `task-version-mismatch`, or `invalid-params` (result failed the contract schema).
 */
declare const invokeTask: <R = unknown>(task: string, params?: Record<string, unknown>) => Promise<R>;
/** The params this app was invoked with as a task callee. */
interface TaskInput {
    task: string;
    params: Record<string, unknown>;
}
/** The task params this app was invoked with, or null if it isn't a task callee. */
declare const getTaskInput: () => TaskInput | null;
/**
 * Finish the task, returning a result to the caller. The host validates it against
 * the contract's result schema before resolving the caller (`invalid-params` on
 * violation), then tears down this overlay.
 */
declare const completeTask: (result: unknown) => void;
/** Abort the task; the caller's `invokeTask` rejects with `cancelled`. */
declare const cancelTask: () => void;
/** React hook: the task input for this callee, re-rendering when it arrives. */
declare const useTaskInput: () => TaskInput | null;

export { type FileCap, type TaskInput, cancelTask, capFile, completeTask, getTaskInput, invokeTask, useTaskInput };
