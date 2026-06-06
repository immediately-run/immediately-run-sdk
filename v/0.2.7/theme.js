import { useEffect, useState } from "react";
import { protocolRequest } from "./sandboxUtils";
const themeService = () => {
  return module.evaluation.module.bundler.theme;
};
const getHostTheme = () => themeService().getTheme();
const onHostThemeChange = (listener) => {
  const disposable = themeService().onChange(listener);
  return () => disposable.dispose();
};
const useHostTheme = () => {
  const [theme, setTheme] = useState(getHostTheme);
  useEffect(() => onHostThemeChange(setTheme), []);
  return theme;
};
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