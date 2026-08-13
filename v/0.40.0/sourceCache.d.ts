type SourceReader = (path: string) => Promise<string>;
interface SourceCache {
    /** The memoised read for `path` — the same promise identity until it settles-and-fails. */
    read: (path: string) => Promise<string>;
    /** Drop a memoised read (a live edit, or an explicit refresh); no argument clears all. */
    invalidate: (path?: string) => void;
    /** Testing/diagnostics: how many paths are memoised right now. */
    size: () => number;
}
declare function createSourceCache(reader: SourceReader): SourceCache;

export { type SourceCache, type SourceReader, createSourceCache };
