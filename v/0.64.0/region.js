import "./chunk-VHAA22YE.js";
import { useEffect, useState } from "react";
import { getHostRuntime } from "./hostRuntime";
import { createPushChannel } from "./pushChannel";
import { REGION_VISIBILITY, REQUEST_REGION_VISIBILITY } from "./generated/protocol";
const getRegion = () => getHostRuntime()?.region ?? null;
const useRegion = () => {
  const [region, setRegion] = useState(getRegion);
  useEffect(() => {
    if (region !== null) return;
    let live = true;
    void getHostRuntime()?.ready?.then(() => {
      if (live) setRegion(getRegion());
    });
    return () => {
      live = false;
    };
  }, [region]);
  return region;
};
const visibility = createPushChannel({
  pushType: REGION_VISIBILITY,
  requestType: REQUEST_REGION_VISIBILITY,
  initial: false,
  // Tolerant parse: `undefined` means "ignore this message", so a malformed push from
  // some future/older host leaves the last good value standing rather than flipping
  // the app to a value nobody sent.
  parse: (msg) => typeof msg.hidden === "boolean" ? msg.hidden : void 0
});
const isRegionHidden = () => visibility.get();
const onRegionVisibilityChange = (listener) => visibility.onChange(listener);
const useRegionHidden = () => visibility.use();
export {
  getRegion,
  isRegionHidden,
  onRegionVisibilityChange,
  useRegion,
  useRegionHidden
};
//# sourceMappingURL=region.js.map