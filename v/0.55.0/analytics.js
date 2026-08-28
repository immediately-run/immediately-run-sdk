import "./chunk-VHAA22YE.js";
import { protocolRequest } from "./sandboxUtils";
import { SCHEMES } from "./protocolSchemes";
import { PROTOCOL_ANALYTICS } from "./generated/protocol";
const emitAnalyticsEvent = (name, props) => protocolRequest(SCHEMES[PROTOCOL_ANALYTICS], "emit", [{ name, ...props ? { props } : {} }]);
const recordRoute = (path) => protocolRequest(SCHEMES[PROTOCOL_ANALYTICS], "route", [{ path }]);
const track = (name, props) => {
  void emitAnalyticsEvent(name, props).catch(() => {
  });
};
const trackRoute = (path) => {
  void recordRoute(path).catch(() => {
  });
};
export {
  emitAnalyticsEvent,
  recordRoute,
  track,
  trackRoute
};
//# sourceMappingURL=analytics.js.map