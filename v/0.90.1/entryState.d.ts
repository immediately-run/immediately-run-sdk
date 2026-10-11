/** How the browser reached the current entry. `push` is an ordinary forward
 *  navigation; `back`/`forward` are traversals, and only a traversal restores. */
type NavigationDirection = 'push' | 'back' | 'forward';
/** Serialized cap for the whole scratch. Past this the scratch is dropped with a
 *  dev-time warning rather than silently truncated: a half-written bookmark that
 *  restores to the wrong place is worse than no bookmark. */
declare const ENTRY_STATE_MAX_BYTES = 4096;
interface ArrivedNavigation {
    /** The scratch the leaving app left on this entry, if any. */
    readonly state: Readonly<Record<string, unknown>> | undefined;
    /** How this entry was reached. */
    readonly direction: NavigationDirection;
}
type Collector = () => unknown;
/**
 * Queue a value for the entry being left. The last call before a navigation wins.
 * Prefer {@link registerEntryStateCollector} for values that are only knowable at the
 * instant of navigating (a scroll offset is the motivating case).
 */
declare const saveEntryState: (key: string, value: unknown) => void;
/** Register a callback asked for its value at navigation time. Returns its remover.
 *  A second registration for the same key replaces the first — one owner per key. */
declare const registerEntryStateCollector: (key: string, collect: Collector) => (() => void);
/**
 * Gather the scratch for the entry being left and clear the queue. Called by
 * `navigate()` — not part of the app-facing surface.
 *
 * A collector that throws is skipped: a bookmark is a convenience, and it must never
 * be able to break a navigation.
 */
declare const takeQueuedEntryState: () => Record<string, unknown> | undefined;
/** Record what the host said about the entry just arrived at. Called by the boot
 *  shell's `urlchange` listener — not part of the app-facing surface. */
declare const receiveNavigation: (next: ArrivedNavigation) => void;
/** The current arrival, as one stable object so `useSyncExternalStore` can compare
 *  by identity. */
declare const getArrivedNavigation: () => ArrivedNavigation;
declare const subscribeNavigation: (listener: () => void) => (() => void);
/** Test seam: forget every collector, queued value and arrival. */
declare const resetEntryState: () => void;

export { type ArrivedNavigation, ENTRY_STATE_MAX_BYTES, type NavigationDirection, getArrivedNavigation, receiveNavigation, registerEntryStateCollector, resetEntryState, saveEntryState, subscribeNavigation, takeQueuedEntryState };
