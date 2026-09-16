import "./chunk-VHAA22YE.js";
import { useCallback, useSyncExternalStore } from "react";
import { getArrivedNavigation, saveEntryState, subscribeNavigation } from "./entryState";
const useEntryState = (key) => {
  const arrived = useSyncExternalStore(subscribeNavigation, getArrivedNavigation, getArrivedNavigation);
  const save = useCallback((value) => saveEntryState(key, value), [key]);
  return { value: arrived.state?.[key], save };
};
const useNavigationDirection = () => {
  const arrived = useSyncExternalStore(subscribeNavigation, getArrivedNavigation, getArrivedNavigation);
  return arrived.direction;
};
export {
  useEntryState,
  useNavigationDirection
};
//# sourceMappingURL=useEntryState.js.map