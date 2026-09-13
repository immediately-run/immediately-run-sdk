// Remember where the reader was, and put them back there on Back (R3-627).
//
// Mount once, near the root, beside `ScrollAfterNavigation`. With no props it
// remembers the document's scroll offset, which is right for an app whose page
// scrolls; an app that scrolls its own container passes a ref to it.
//
// What it does NOT do: fight the reader, fight a deep link, or scroll a page the
// reader arrived at by clicking a link. Only a history traversal restores, only if
// the entry carries an offset, and only until the reader touches the scroller.

import { type RefObject, use, useEffect, useRef } from 'react';

import { registerEntryStateCollector } from '../entryState';
import { nextRestoreAction, RESTORE_DEADLINE_MS } from '../scrollRestore';
import { TinkerableContext } from '../TinkerableContext';
import { useEntryState, useNavigationDirection } from '../useEntryState';

/** The key this component owns in the entry scratch. One owner per key. */
const SCROLL_KEY = 'ir.scroll';

/** The geometry of whatever is scrolling, read uniformly for the document and for a
 *  container, so the decision module never has to care which it is. */
interface Scroller {
  offset(): number;
  scrollTo(top: number): void;
  scrollHeight(): number;
  clientHeight(): number;
  listen(onScroll: () => void): () => void;
}

const documentScroller = (): Scroller | null => {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null;
  const el = () => document.scrollingElement ?? document.documentElement;
  return {
    offset: () => window.scrollY,
    scrollTo: (top) => window.scrollTo(0, top),
    scrollHeight: () => el().scrollHeight,
    clientHeight: () => window.innerHeight,
    listen: (onScroll) => {
      window.addEventListener('scroll', onScroll, { passive: true });
      return () => window.removeEventListener('scroll', onScroll);
    },
  };
};

const elementScroller = (el: HTMLElement): Scroller => ({
  offset: () => el.scrollTop,
  scrollTo: (top) => {
    el.scrollTop = top;
  },
  scrollHeight: () => el.scrollHeight,
  clientHeight: () => el.clientHeight,
  listen: (onScroll) => {
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  },
});

export interface ScrollRestorationProps {
  /** The element that scrolls. Omit when the document scrolls. */
  scroller?: RefObject<HTMLElement | null>;
}

/**
 * Null-rendering. Remembers the scroller's offset on the entry being left, and
 * restores it when the reader returns to that entry.
 */
export const ScrollRestoration = ({ scroller }: ScrollRestorationProps = {}): null => {
  const { value: rememberedOffset } = useEntryState<number>(SCROLL_KEY);
  const direction = useNavigationDirection();
  const { navigationState } = use(TinkerableContext);
  const hasFragment = Boolean(navigationState.hash);
  // Read through a ref so the collector registered below is stable for the life of
  // the component: re-registering per render would churn the one-owner-per-key map.
  const scrollerRef = useRef(scroller);
  scrollerRef.current = scroller;

  const resolve = (): Scroller | null => {
    const el = scrollerRef.current?.current;
    return el ? elementScroller(el) : documentScroller();
  };

  // Save: asked at navigation time, from inside `navigate()`.
  useEffect(() => {
    return registerEntryStateCollector(SCROLL_KEY, () => {
      const s = resolve();
      const offset = s?.offset() ?? 0;
      // Nothing to remember about the top of a page; leaving the key out keeps the
      // scratch empty in the common case, so most entries carry no state at all.
      return offset > 0 ? Math.round(offset) : undefined;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore: only on a traversal, only with an offset, and never over a deep link.
  useEffect(() => {
    if (direction === 'push') return;
    if (hasFragment) return; // an explicit #fragment outranks a remembered position
    if (typeof rememberedOffset !== 'number') return;
    const s = resolve();
    if (!s) return;

    const startedAt = Date.now();
    let userScrolled = false;
    let done = false;

    const finish = () => {
      done = true;
      stopListening();
      observer?.disconnect();
      timers.forEach(clearTimeout);
    };

    const attempt = () => {
      if (done) return;
      const action = nextRestoreAction({
        target: rememberedOffset,
        scrollHeight: s.scrollHeight(),
        clientHeight: s.clientHeight(),
        current: s.offset(),
        elapsedMs: Date.now() - startedAt,
        userScrolled,
      });
      if (action === 'wait') return;
      if (action === 'apply') s.scrollTo(rememberedOffset);
      finish();
    };

    // The reader wins: the first scroll they make ends the attempt. Registered
    // before the first attempt so a scroll during that frame is not missed.
    const stopListening = s.listen(() => {
      // Our own `scrollTo` fires this too; `done` is set before the event lands
      // because `finish()` runs synchronously after `apply`.
      if (!done) userScrolled = true;
    });

    // The content arrives asynchronously, so sample as it grows: on DOM changes, on
    // the same ladder `ScrollAfterNavigation` uses, and once at the deadline.
    const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => attempt());
    observer?.observe(document.body, { childList: true, subtree: true });
    const timers = [0, 120, 300, 600, RESTORE_DEADLINE_MS].map((ms) => setTimeout(attempt, ms));

    return finish;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rememberedOffset, direction, hasFragment]);

  return null;
};
