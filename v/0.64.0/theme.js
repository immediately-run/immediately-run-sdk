import "./chunk-VHAA22YE.js";
import { createPushChannel } from "./pushChannel";
import { protocolRequest } from "./sandboxUtils";
import { PROTOCOL_THEME, REQUEST_THEME, REQUEST_THEME_CATALOG, THEME, THEME_CATALOG } from "./generated/protocol";
import { SCHEMES } from "./protocolSchemes";
const DEFAULT_SELECTION = {
  theme: "dark",
  themeKey: "immediately-run-default",
  modeId: "dark"
};
const channel = createPushChannel({
  pushType: THEME,
  requestType: REQUEST_THEME,
  initial: DEFAULT_SELECTION,
  parse: (msg) => {
    if (msg.theme !== "light" && msg.theme !== "dark") return void 0;
    if (typeof msg.themeKey !== "string" || typeof msg.modeId !== "string") return void 0;
    return { theme: msg.theme, themeKey: msg.themeKey, modeId: msg.modeId };
  }
});
const getHostTheme = () => channel.get().theme;
const onHostThemeChange = (listener) => channel.onChange((sel) => listener(sel.theme));
const useHostTheme = () => channel.use().theme;
const getHostThemeSelection = () => channel.get();
const onHostThemeSelectionChange = (listener) => channel.onChange(listener);
const useHostThemeSelection = () => channel.use();
const DEFAULT_CATALOG = { themes: [] };
const catalogChannel = createPushChannel({
  pushType: THEME_CATALOG,
  requestType: REQUEST_THEME_CATALOG,
  initial: DEFAULT_CATALOG,
  parse: (msg) => {
    const themes = msg.themes;
    if (!Array.isArray(themes)) return void 0;
    const out = [];
    for (const t of themes) {
      if (!t || typeof t !== "object") return void 0;
      const entry = t;
      if (typeof entry.themeKey !== "string" || typeof entry.label !== "string" || !Array.isArray(entry.modes)) {
        return void 0;
      }
      const modes = [];
      for (const m of entry.modes) {
        if (!m || typeof m !== "object") return void 0;
        const mode = m;
        if (typeof mode.id !== "string" || mode.polarity !== "light" && mode.polarity !== "dark") {
          return void 0;
        }
        modes.push({ id: mode.id, polarity: mode.polarity });
      }
      out.push({ themeKey: entry.themeKey, label: entry.label, modes });
    }
    return { themes: out };
  }
});
const getThemeCatalog = () => catalogChannel.get();
const onThemeCatalogChange = (listener) => catalogChannel.onChange(listener);
const useThemeCatalog = () => catalogChannel.use();
const setTheme = async (params) => {
  const res = await protocolRequest(SCHEMES[PROTOCOL_THEME], "set", [params]);
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? "setHostTheme failed");
    err.code = (res && "code" in res ? res.code : void 0) ?? "unknown";
    throw err;
  }
};
const setHostThemeSelection = async (selection) => {
  await setTheme(selection);
};
const setHostTheme = async (theme) => {
  await setTheme({ theme });
};
const addThemeSource = async (location) => {
  const res = await protocolRequest(SCHEMES[PROTOCOL_THEME], "add-source", [{ location }]);
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? "addThemeSource failed");
    err.code = (res && "code" in res ? res.code : void 0) ?? "unknown";
    throw err;
  }
};
const removeThemeSource = async (themeKey) => {
  const res = await protocolRequest(SCHEMES[PROTOCOL_THEME], "remove-source", [{ themeKey }]);
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? "removeThemeSource failed");
    err.code = (res && "code" in res ? res.code : void 0) ?? "unknown";
    throw err;
  }
};
export {
  addThemeSource,
  getHostTheme,
  getHostThemeSelection,
  getThemeCatalog,
  onHostThemeChange,
  onHostThemeSelectionChange,
  onThemeCatalogChange,
  removeThemeSource,
  setHostTheme,
  setHostThemeSelection,
  useHostTheme,
  useHostThemeSelection,
  useThemeCatalog
};
//# sourceMappingURL=theme.js.map