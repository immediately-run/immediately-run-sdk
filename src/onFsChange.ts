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
import { FS_CHANGE } from './generated/protocol';

/** One server-side change in a mount batch: the path (mount-relative, leading
 *  slash) and its kind — the Node `watch` event mapping is `add`/`remove` →
 *  `rename`, `change` → `change`. (R3-409.) */
export interface MountChange {
  path: string;
  kind: 'add' | 'change' | 'remove';
}

/** One working-tree change batch the host pushes: the changed paths plus an epoch. */
export interface FsChange {
  /** Repo-relative paths (leading slash, e.g. `/src/App.tsx`) that just changed. */
  paths: string[];
  /**
   * Monotonic batch id — bumps on every change even if the path set repeats, so a
   * subscriber re-fires for a second edit to the same file (the value is never
   * deduplicated away). `0` is the pre-first-event initial.
   */
  epoch: number;
  /**
   * R3-409 — a SPACE mount's server-side change batch (another tab's/member's
   * writes), anchored at the mount path the frame holds. The `fs.watch` events
   * themselves are delivered by the sandbox's fs shim (no SDK surface needed);
   * this field is DECLARED so the wire shape has one written-down type on this
   * side too (the R3-274e lesson), and so an SDK consumer that wants the raw
   * per-mount batches can read them. Absent on the working-tree leg.
   */
  mount?: {
    /** The sandbox mount root the `changes[].path`s are relative to (e.g. `/mnt/{hash}`). */
    path: string;
    changes: MountChange[];
  };
}

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((p) => typeof p === 'string');

const isMountBatch = (v: unknown): v is FsChange['mount'] => {
  if (typeof v !== 'object' || v === null) return false;
  const m = v as { path?: unknown; changes?: unknown };
  if (typeof m.path !== 'string' || !Array.isArray(m.changes)) return false;
  return m.changes.every(
    (c) =>
      typeof c === 'object' &&
      c !== null &&
      typeof (c as { path?: unknown }).path === 'string' &&
      ['add', 'change', 'remove'].includes((c as { kind?: unknown }).kind as string),
  );
};

const channel = createPushChannel<FsChange>({
  pushType: FS_CHANGE,
  initial: { paths: [], epoch: 0 },
  parse: (msg) =>
    isStringArray(msg.paths) && typeof msg.epoch === 'number'
      ? {
          paths: msg.paths,
          epoch: msg.epoch,
          ...(isMountBatch(msg.mount) ? { mount: msg.mount } : {}),
        }
      : undefined,
});

/** The most recent working-tree change batch (the empty initial until the first). */
export const getFsChange = (): FsChange => channel.get();

/**
 * Subscribe to working-tree changes. The listener fires immediately with the
 * current batch, then on every host push. Returns an unsubscribe fn. The common
 * use: re-read an open file when its path appears in `change.paths`.
 */
export const onFsChange = (listener: (change: FsChange) => void): (() => void) => channel.onChange(listener);

/** React hook: the current working-tree change batch, re-rendering on every push. */
export const useFsChange = (): FsChange => channel.use();
