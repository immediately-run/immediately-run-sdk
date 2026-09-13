// React surface over the per-history-entry scratch (R3-627). The store itself is in
// `entryState.ts` and is framework-free; this file is the thin binding so a component
// re-renders when the host tells the frame which entry it just arrived at.

import { useCallback, useSyncExternalStore } from 'react';

import { getArrivedNavigation, saveEntryState, subscribeNavigation, type NavigationDirection } from './entryState';

/**
 * Read the value this app left on the current history entry, and queue the value to
 * leave on the entry the next navigation departs from.
 *
 * `value` is `undefined` on an ordinary forward navigation — there is no bookmark for
 * a page being visited for the first time — and on a traversal to an entry that was
 * stamped by nothing (a navigation the app did not initiate).
 *
 * `save` queues; it does not send. The queued value travels with the next
 * `navigate()`, which is the only moment the app knows an entry is being left.
 */
export const useEntryState = <T>(key: string): { value: T | undefined; save: (value: T) => void } => {
  const arrived = useSyncExternalStore(subscribeNavigation, getArrivedNavigation, getArrivedNavigation);
  const save = useCallback((value: T) => saveEntryState(key, value), [key]);
  return { value: arrived.state?.[key] as T | undefined, save };
};

/**
 * How the browser reached the page being rendered: `push` for an ordinary
 * navigation, `back`/`forward` for a history traversal.
 *
 * An app that resets its own view on arrival — scrolling a container to the top is
 * the usual one — should stand down on a traversal, so a restored position is not
 * immediately thrown away.
 */
export const useNavigationDirection = (): NavigationDirection => {
  const arrived = useSyncExternalStore(subscribeNavigation, getArrivedNavigation, getArrivedNavigation);
  return arrived.direction;
};
