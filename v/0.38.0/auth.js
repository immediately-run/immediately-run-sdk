import "./chunk-VHAA22YE.js";
import { createPushChannel } from "./pushChannel";
const isAuthState = (v) => {
  const s = v;
  return !!s && (s.status === "unknown" || s.status === "signed-in" || s.status === "signed-out") && (s.user === null || typeof s.user === "object" && typeof s.user.login === "string");
};
const channel = createPushChannel({
  pushType: "auth-state",
  requestType: "request-auth-state",
  initial: { status: "unknown", user: null },
  parse: (msg) => isAuthState(msg.state) ? msg.state : void 0
});
const getAuthState = () => channel.get();
const onAuthChange = (listener) => channel.onChange(listener);
const useAuth = () => channel.use();
export {
  getAuthState,
  onAuthChange,
  useAuth
};
//# sourceMappingURL=auth.js.map