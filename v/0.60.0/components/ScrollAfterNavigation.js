import "../chunk-VHAA22YE.js";
import { use, useEffect } from "react";
import { TinkerableContext } from "../TinkerableContext";
import { scrollToId } from "../scrollToId";
const useScrollAfterNavigation = () => {
  const { navigationState } = use(TinkerableContext);
  const frag = navigationState.hash;
  const navKey = `${navigationState.sandboxPath}\0${frag}`;
  useEffect(() => {
    if (!frag || typeof document === "undefined") return;
    if (scrollToId(frag)) return;
    let done = false;
    const finish = () => {
      done = true;
      observer.disconnect();
      timers.forEach(clearTimeout);
      clearTimeout(finalTimer);
    };
    const tryScroll = () => {
      if (!done && scrollToId(frag)) finish();
    };
    const observer = new MutationObserver(tryScroll);
    const timers = [120, 300, 600].map((ms) => setTimeout(tryScroll, ms));
    const finalTimer = setTimeout(() => {
      if (!done) {
        finish();
        window.scrollTo?.(0, 0);
      }
    }, 900);
    observer.observe(document.body, { childList: true, subtree: true });
    return finish;
  }, [navKey, frag]);
};
const ScrollAfterNavigation = () => {
  useScrollAfterNavigation();
  return null;
};
export {
  ScrollAfterNavigation,
  useScrollAfterNavigation
};
//# sourceMappingURL=ScrollAfterNavigation.js.map