import { useEffect, useState } from "react";
import { getHostRuntime } from "./hostRuntime";
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
export {
  getRegion,
  useRegion
};
//# sourceMappingURL=region.js.map