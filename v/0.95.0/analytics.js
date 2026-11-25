import "./chunk-VHAA22YE.js";
import { protocolRequest } from "./sandboxUtils.js";
import { SCHEMES } from "./protocolSchemes.js";
import { PROTOCOL_ANALYTICS } from "./generated/protocol.js";
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