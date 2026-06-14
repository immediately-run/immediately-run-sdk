import { createPushChannel } from "./pushChannel";
import { protocolRequest } from "./sandboxUtils";
const channel = createPushChannel({
  pushType: "theme",
  requestType: "request-theme",
  initial: "dark",
  parse: (msg) => msg.theme === "light" || msg.theme === "dark" ? msg.theme : void 0
});
const getHostTheme = () => channel.get();
const onHostThemeChange = (listener) => channel.onChange(listener);
const useHostTheme = () => channel.use();
const setHostTheme = async (theme) => {
  const res = await protocolRequest("theme", "set", [{ theme }]);
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? "setHostTheme failed");
    err.code = (res && "code" in res ? res.code : void 0) ?? "unknown";
    throw err;
  }
};
export {
  getHostTheme,
  onHostThemeChange,
  setHostTheme,
  useHostTheme
};
//# sourceMappingURL=theme.js.map