import "./chunk-VHAA22YE.js";
import { createPushChannel } from "./pushChannel";
import { CHROME_STATE, REQUEST_CHROME_STATE } from "./generated/protocol";
const DEFAULT_CHROME_STATE = { overlay: "none", tab: { edge: "top-right" } };
const isChromeState = (v) => {
  const c = v;
  return !!c && (c.overlay === "none" || c.overlay === "menu") && !!c.tab && typeof c.tab === "object" && c.tab.edge === "top-right";
};
const channel = createPushChannel({
  pushType: CHROME_STATE,
  requestType: REQUEST_CHROME_STATE,
  initial: DEFAULT_CHROME_STATE,
  parse: (msg) => isChromeState(msg.chromeState) ? msg.chromeState : void 0
});
const getChromeState = () => channel.get();
const onChromeStateChange = (listener) => channel.onChange(listener);
const useChromeState = () => channel.use();
export {
  getChromeState,
  onChromeStateChange,
  useChromeState
};
//# sourceMappingURL=chromeState.js.map