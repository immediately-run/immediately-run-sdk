// Working-tree change stream (EDITOR_AS_APP_SPEC §4.2). The host pushes the
// repo-relative paths that just changed in the working tree — from ANY writer: an
// agent's port write, a host `editor:write` action (create/delete/rename), or the
// preview's own copy-on-write. A working-tree observer (the editor app, the file
// explorer) reacts by re-reading the affected files instead of polling.
//
// Elevated `editor:read` — a previewed app holds no `editor:read`, so it never sees
// the stream (the host channel ACL withholds it). Push-only: there is no past-event
// state worth polling, so the empty initial stands until the first write.
//
// Origin-exclusion is the CONSUMER's responsibility: the editor must ignore the
// echo of its OWN write (a debounced write lags the buffer, so re-reading it as
// "external" would surface a false conflict). Compare the changed file's bytes to
// what you last wrote; if they match, it is your echo, not an external change.
import { createPushChannel } from './pushChannel';

export interface FsChange {
  /** Repo-relative paths (leading slash, e.g. `/src/App.tsx`) that just changed. */
  paths: string[];
  /**
   * Monotonic batch id — bumps on every change even if the path set repeats, so a
   * subscriber re-fires for a second edit to the same file (the value is never
   * deduplicated away). `0` is the pre-first-event initial.
   */
  epoch: number;
}

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((p) => typeof p === 'string');

const channel = createPushChannel<FsChange>({
  pushType: 'fs-change',
  initial: { paths: [], epoch: 0 },
  parse: (msg) =>
    isStringArray(msg.paths) && typeof msg.epoch === 'number'
      ? { paths: msg.paths, epoch: msg.epoch }
      : undefined,
});

/** The most recent working-tree change batch (the empty initial until the first). */
export const getFsChange = (): FsChange => channel.get();

/**
 * Subscribe to working-tree changes. The listener fires immediately with the
 * current batch, then on every host push. Returns an unsubscribe fn. The common
 * use: re-read an open file when its path appears in `change.paths`.
 */
export const onFsChange = (listener: (change: FsChange) => void): (() => void) =>
  channel.onChange(listener);

/** React hook: the current working-tree change batch, re-rendering on every push. */
export const useFsChange = (): FsChange => channel.use();
