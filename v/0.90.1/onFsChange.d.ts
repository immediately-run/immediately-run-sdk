/** One server-side change in a mount batch: the path (mount-relative, leading
 *  slash) and its kind — the Node `watch` event mapping is `add`/`remove` →
 *  `rename`, `change` → `change`. (R3-409.) */
interface MountChange {
    path: string;
    kind: 'add' | 'change' | 'remove';
}
/** One working-tree change batch the host pushes: the changed paths plus an epoch. */
interface FsChange {
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
/** The most recent working-tree change batch (the empty initial until the first). */
declare const getFsChange: () => FsChange;
/**
 * Subscribe to working-tree changes. The listener fires immediately with the
 * current batch, then on every host push. Returns an unsubscribe fn. The common
 * use: re-read an open file when its path appears in `change.paths`.
 */
declare const onFsChange: (listener: (change: FsChange) => void) => (() => void);
/** React hook: the current working-tree change batch, re-rendering on every push. */
declare const useFsChange: () => FsChange;

export { type FsChange, type MountChange, getFsChange, onFsChange, useFsChange };
