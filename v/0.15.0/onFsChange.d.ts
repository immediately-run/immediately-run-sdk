interface FsChange {
    /** Repo-relative paths (leading slash, e.g. `/src/App.tsx`) that just changed. */
    paths: string[];
    /**
     * Monotonic batch id — bumps on every change even if the path set repeats, so a
     * subscriber re-fires for a second edit to the same file (the value is never
     * deduplicated away). `0` is the pre-first-event initial.
     */
    epoch: number;
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

export { type FsChange, getFsChange, onFsChange, useFsChange };
