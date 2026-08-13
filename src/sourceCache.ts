// A memoised raw-source reader for React `use()`. (R3-263)
//
// `use()` needs a STABLE promise across renders, so a component that reads a file must not
// start a new read every time it renders. That much is obvious. The part that is not, and
// the reason this lives in the SDK rather than being re-derived per app, is what happens
// when a read FAILS:
//
//   a rejected promise left in the cache is returned to EVERY later render, so the file can
//   never recover.
//
// That is not theoretical. The host↔sandbox RPC drops requests during a navigation
// ("Invalid RPC id"), and a wiki entry whose read lost that race stayed **permanently blank
// for the rest of the session** — no error, no retry, nothing short of a reload. Evicting on
// rejection makes the next attempt a fresh read, so a transient failure costs a retry
// instead of the page.
//
// Injectable reader, no `fs` import: the cache is pure and testable without a host, and the
// same instance serves whatever mount the caller reads from.

export type SourceReader = (path: string) => Promise<string>;

export interface SourceCache {
  /** The memoised read for `path` — the same promise identity until it settles-and-fails. */
  read: (path: string) => Promise<string>;
  /** Drop a memoised read (a live edit, or an explicit refresh); no argument clears all. */
  invalidate: (path?: string) => void;
  /** Testing/diagnostics: how many paths are memoised right now. */
  size: () => number;
}

export function createSourceCache(reader: SourceReader): SourceCache {
  const cache = new Map<string, Promise<string>>();
  return {
    read(path) {
      const hit = cache.get(path);
      if (hit) return hit;
      const p = reader(path).catch((error: unknown) => {
        // Never let a failure become the permanent answer for this path. Guarded on
        // identity so a newer read started after an invalidate is not evicted by an older
        // one settling late.
        if (cache.get(path) === p) cache.delete(path);
        throw error;
      });
      cache.set(path, p);
      return p;
    },
    invalidate(path) {
      if (path === undefined) cache.clear();
      else cache.delete(path);
    },
    size: () => cache.size,
  };
}
