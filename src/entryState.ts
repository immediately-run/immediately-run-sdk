// Per-history-entry scratch (R3-627): a small opaque value an app attaches to the
// history entry it is LEAVING, and reads back when the browser returns to that entry.
//
// Why this exists. The app frame's realm is replaced by an in-app navigation, so
// nothing in app memory survives it; the host owns the history stack but is at an
// opaque origin and cannot look inside the frame. So the only way an app can leave
// itself a bookmark is to hand the host a value to hold against the entry. The host
// never parses it — it is the app's own value coming back to the app, which is why
// this does not weaken `EDITOR_AS_APP_SPEC §2` ("view state … never crosses the
// boundary"): the host is a courier, not a reader.
//
// Collected at navigation time, not continuously. The app is the one calling
// `navigate()`, so the scratch is gathered synchronously inside that call — no scroll
// reporting channel, no throttling, no traffic for a value needed at one instant.

/** How the browser reached the current entry. `push` is an ordinary forward
 *  navigation; `back`/`forward` are traversals, and only a traversal restores. */
export type NavigationDirection = 'push' | 'back' | 'forward';

/** Serialized cap for the whole scratch. Past this the scratch is dropped with a
 *  dev-time warning rather than silently truncated: a half-written bookmark that
 *  restores to the wrong place is worse than no bookmark. */
export const ENTRY_STATE_MAX_BYTES = 4096;

export interface ArrivedNavigation {
  /** The scratch the leaving app left on this entry, if any. */
  readonly state: Readonly<Record<string, unknown>> | undefined;
  /** How this entry was reached. */
  readonly direction: NavigationDirection;
}

type Collector = () => unknown;

const collectors = new Map<string, Collector>();
let queued: Record<string, unknown> = {};
let arrived: ArrivedNavigation = { state: undefined, direction: 'push' };
const listeners = new Set<() => void>();

const notify = (): void => {
  for (const l of [...listeners]) l();
};

/**
 * Queue a value for the entry being left. The last call before a navigation wins.
 * Prefer {@link registerEntryStateCollector} for values that are only knowable at the
 * instant of navigating (a scroll offset is the motivating case).
 */
export const saveEntryState = (key: string, value: unknown): void => {
  queued[key] = value;
};

/** Register a callback asked for its value at navigation time. Returns its remover.
 *  A second registration for the same key replaces the first — one owner per key. */
export const registerEntryStateCollector = (key: string, collect: Collector): (() => void) => {
  collectors.set(key, collect);
  return () => {
    if (collectors.get(key) === collect) collectors.delete(key);
  };
};

/**
 * Gather the scratch for the entry being left and clear the queue. Called by
 * `navigate()` — not part of the app-facing surface.
 *
 * A collector that throws is skipped: a bookmark is a convenience, and it must never
 * be able to break a navigation.
 */
export const takeQueuedEntryState = (): Record<string, unknown> | undefined => {
  const out: Record<string, unknown> = { ...queued };
  queued = {};
  for (const [key, collect] of collectors) {
    try {
      const value = collect();
      if (value !== undefined) out[key] = value;
    } catch {
      /* a collector must not break navigation */
    }
  }
  if (Object.keys(out).length === 0) return undefined;
  let size = 0;
  try {
    size = JSON.stringify(out).length;
  } catch {
    return undefined; // not serializable → nothing to hand the host
  }
  if (size > ENTRY_STATE_MAX_BYTES) {
    console.warn(
      `[Sandbox] entry state is ${size} bytes, over the ${ENTRY_STATE_MAX_BYTES}-byte cap — dropped. ` +
        `Keep per-entry scratch small (a scroll offset, a few ids), not a cache.`,
    );
    return undefined;
  }
  return out;
};

/** Record what the host said about the entry just arrived at. Called by the boot
 *  shell's `urlchange` listener — not part of the app-facing surface. */
export const receiveNavigation = (next: ArrivedNavigation): void => {
  arrived = next;
  notify();
};

/** The current arrival, as one stable object so `useSyncExternalStore` can compare
 *  by identity. */
export const getArrivedNavigation = (): ArrivedNavigation => arrived;

export const subscribeNavigation = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Test seam: forget every collector, queued value and arrival. */
export const resetEntryState = (): void => {
  collectors.clear();
  queued = {};
  arrived = { state: undefined, direction: 'push' };
  listeners.clear();
};
