import "../chunk-VHAA22YE.js";
import { use, useEffect, useRef } from "react";
import { registerEntryStateCollector } from "../entryState";
import { nextRestoreAction, RESTORE_DEADLINE_MS } from "../scrollRestore";
import { TinkerableContext } from "../TinkerableContext";
import { useEntryState, useNavigationDirection } from "../useEntryState";
const SCROLL_KEY = "ir.scroll";
const documentScroller = () => {
  if (typeof document === "undefined" || typeof window === "undefined") return null;
  const el = () => document.scrollingElement ?? document.documentElement;
  return {
    offset: () => window.scrollY,
    scrollTo: (top) => window.scrollTo(0, top),
    scrollHeight: () => el().scrollHeight,
    clientHeight: () => window.innerHeight,
    listen: (onScroll) => {
      window.addEventListener("scroll", onScroll, { passive: true });
      return () => window.removeEventListener("scroll", onScroll);
    }
  };
};
const elementScroller = (el) => ({
  offset: () => el.scrollTop,
  scrollTo: (top) => {
    el.scrollTop = top;
  },
  scrollHeight: () => el.scrollHeight,
  clientHeight: () => el.clientHeight,
  listen: (onScroll) => {
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }
});
const ScrollRestoration = ({ scroller } = {}) => {
  const { value: rememberedOffset } = useEntryState(SCROLL_KEY);
  const direction = useNavigationDirection();
  const { navigationState } = use(TinkerableContext);
  const hasFragment = Boolean(navigationState.hash);
  const scrollerRef = useRef(scroller);
  scrollerRef.current = scroller;
  const resolve = () => {
    const el = scrollerRef.current?.current;
    return el ? elementScroller(el) : documentScroller();
  };
  useEffect(() => {
    return registerEntryStateCollector(SCROLL_KEY, () => {
      const s = resolve();
      const offset = s?.offset() ?? 0;
      return offset > 0 ? Math.round(offset) : void 0;
    });
  }, []);
  useEffect(() => {
    if (direction === "push") return;
    if (hasFragment) return;
    if (typeof rememberedOffset !== "number") return;
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
        userScrolled
      });
      if (action === "wait") return;
      if (action === "apply") s.scrollTo(rememberedOffset);
      finish();
    };
    const stopListening = s.listen(() => {
      if (!done) userScrolled = true;
    });
    const observer = typeof MutationObserver === "undefined" ? null : new MutationObserver(() => attempt());
    observer?.observe(document.body, { childList: true, subtree: true });
    const timers = [0, 120, 300, 600, RESTORE_DEADLINE_MS].map((ms) => setTimeout(attempt, ms));
    return finish;
  }, [rememberedOffset, direction, hasFragment]);
  return null;
};
export {
  ScrollRestoration
};
//# sourceMappingURL=ScrollRestoration.js.map