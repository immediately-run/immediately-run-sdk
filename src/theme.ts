import { createPushChannel } from './pushChannel';
import { protocolRequest } from './sandboxUtils';
import { PROTOCOL_THEME, REQUEST_THEME, REQUEST_THEME_CATALOG, THEME, THEME_CATALOG } from './generated/protocol';
import { SCHEMES } from './protocolSchemes';

/**
 * The host UI theme polarity, mirrored from the immediately.run host window into
 * the sandbox. Your app can read this to render in step with the host chrome
 * (light / dark).
 *
 * This is the baseline `theme:read` capability — every app may read it. Changing
 * the host theme is a separate, elevated action (`theme:set`), available only to
 * the theme-toggle system app.
 *
 * `HostTheme` is the RESOLVED POLARITY only. The full selection — which theme is
 * active and which of its modes — is {@link HostThemeSelection}.
 */
export type HostTheme = 'light' | 'dark';

/**
 * The full host theme selection (HOST_THEMING_SPEC §2/§9.1): the resolved polarity
 * plus the active theme's registry key and resolved mode. Carried on the widened
 * `theme` push. `modeId` is always the RESOLVED mode (never the literal `system` —
 * an app wants to know what is on screen).
 */
export interface HostThemeSelection {
  /** Resolved polarity — the same value the legacy `theme` field carried. */
  theme: HostTheme;
  /** The host-minted registry key of the active theme. */
  themeKey: string;
  /** The resolved active mode id of the active theme. */
  modeId: string;
}

/**
 * The selection assumed before the host reports. The platform default theme is
 * `immediately-run-default` (dark polarity first-paint, matching the shipped
 * provider default — HOST_THEMING_SPEC §3 build-time correction).
 */
const DEFAULT_SELECTION: HostThemeSelection = {
  theme: 'dark',
  themeKey: 'immediately-run-default',
  modeId: 'dark',
};

// Read over the transport (SDK_PACKAGING_SPEC §4): the host pushes `theme` and
// answers `request-theme` (wire format: site-main channelBridge.ts). The parse
// reads ALL THREE fields so the full selection survives the transport; the
// polarity-only surface derives from it.
const channel = createPushChannel<HostThemeSelection>({
  pushType: THEME,
  requestType: REQUEST_THEME,
  initial: DEFAULT_SELECTION,
  parse: (msg) => {
    if (msg.theme !== 'light' && msg.theme !== 'dark') return undefined;
    if (typeof msg.themeKey !== 'string' || typeof msg.modeId !== 'string') return undefined;
    return { theme: msg.theme, themeKey: msg.themeKey, modeId: msg.modeId };
  },
});

/**
 * Returns the current host theme polarity. Poll this for a one-off read; use
 * {@link onHostThemeChange} or {@link useHostTheme} to react to changes.
 */
export const getHostTheme = (): HostTheme => channel.get().theme;

/**
 * Subscribe to host theme polarity changes. The listener is invoked immediately
 * with the current polarity, then again on every change. Returns an unsubscribe fn.
 */
export const onHostThemeChange = (listener: (theme: HostTheme) => void): (() => void) =>
  channel.onChange((sel) => listener(sel.theme));

/**
 * React hook returning the current host theme polarity, re-rendering when it
 * changes. The recommended way to implement an app's own `useTheme`: follow the
 * host, allow a local override.
 */
export const useHostTheme = (): HostTheme => channel.use().theme;

/**
 * Returns the current full host theme selection — polarity, active theme key, and
 * resolved mode. Use {@link useHostThemeSelection} to react to changes.
 */
export const getHostThemeSelection = (): HostThemeSelection => channel.get();

/**
 * Subscribe to full host theme selection changes. The listener is invoked
 * immediately with the current selection, then again on every change. Returns an
 * unsubscribe fn.
 */
export const onHostThemeSelectionChange = (listener: (selection: HostThemeSelection) => void): (() => void) =>
  channel.onChange(listener);

/** React hook returning the current full host theme selection. */
export const useHostThemeSelection = (): HostThemeSelection => channel.use();

/**
 * One entry of the theme catalogue: a selectable theme and its modes. The
 * catalogue is projected per grant — the baseline `theme:read` projection carries
 * NO source identities (no repo coordinates, no spaceIds), and labels are bounded.
 */
export interface ThemeCatalogEntry {
  themeKey: string;
  label: string;
  modes: { id: string; polarity: 'light' | 'dark' }[];
}

/**
 * The loaded-theme catalogue (HOST_THEMING_SPEC §9.2): every selectable theme, so
 * a theme-aware app can render a picker and match chrome. Pushed on
 * `theme-catalog` / polled with `request-theme-catalog`.
 */
export interface ThemeCatalog {
  themes: ThemeCatalogEntry[];
}

const DEFAULT_CATALOG: ThemeCatalog = { themes: [] };

const catalogChannel = createPushChannel<ThemeCatalog>({
  pushType: THEME_CATALOG,
  requestType: REQUEST_THEME_CATALOG,
  initial: DEFAULT_CATALOG,
  parse: (msg) => {
    const themes = msg.themes;
    if (!Array.isArray(themes)) return undefined;
    const out: ThemeCatalogEntry[] = [];
    for (const t of themes as unknown[]) {
      if (!t || typeof t !== 'object') return undefined;
      const entry = t as { themeKey?: unknown; label?: unknown; modes?: unknown };
      if (typeof entry.themeKey !== 'string' || typeof entry.label !== 'string' || !Array.isArray(entry.modes)) {
        return undefined;
      }
      const modes: ThemeCatalogEntry['modes'] = [];
      for (const m of entry.modes) {
        if (!m || typeof m !== 'object') return undefined;
        const mode = m as { id?: unknown; polarity?: unknown };
        if (typeof mode.id !== 'string' || (mode.polarity !== 'light' && mode.polarity !== 'dark')) {
          return undefined;
        }
        modes.push({ id: mode.id, polarity: mode.polarity });
      }
      out.push({ themeKey: entry.themeKey, label: entry.label, modes });
    }
    return { themes: out };
  },
});

/**
 * Returns the current theme catalogue (themes + their modes). Use
 * {@link useThemeCatalog} to react to changes.
 */
export const getThemeCatalog = (): ThemeCatalog => catalogChannel.get();

/**
 * Subscribe to theme catalogue changes. The listener is invoked immediately with
 * the current catalogue, then again on every change. Returns an unsubscribe fn.
 */
export const onThemeCatalogChange = (listener: (catalog: ThemeCatalog) => void): (() => void) =>
  catalogChannel.onChange(listener);

/** React hook returning the current theme catalogue. */
export const useThemeCatalog = (): ThemeCatalog => catalogChannel.use();

/**
 * A location the open-bundle picker returned — a repo or a space, with a
 * confined in-bundle path (OPEN_BUNDLE_SPEC §2). Carried to the host's
 * `theme:sources` `add-source` verb.
 */
export type ThemeBundleLocation =
  | { kind: 'repo'; repo: string; ref?: string; path: string }
  | { kind: 'space'; spaceId: string; path: string };

/**
 * The canonical `theme:set` params (HOST_THEMING_SPEC §9.3). `theme` is the
 * registry key of the theme to select (or the legacy `'light' | 'dark'` polarity —
 * the host disambiguates by the reserved-id rule: legacy iff the value is
 * light/dark AND `mode` is absent). `mode` is one of that theme's modes or
 * `'system'`.
 */
export interface SetHostThemeSelectionParams {
  theme: string;
  mode?: string;
}

/** The one `set` call site, so the wire shape is fingerprint-stable. */
const setTheme = async (params: SetHostThemeSelectionParams): Promise<void> => {
  const res = (await protocolRequest(SCHEMES[PROTOCOL_THEME], 'set', [params])) as
    | { ok: true; data?: unknown }
    | { ok: false; code?: string; message?: string }
    | undefined;
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? 'setHostTheme failed') as Error & {
      code?: string;
    };
    err.code = (res && 'code' in res ? res.code : undefined) ?? 'unknown';
    throw err;
  }
};

/**
 * Set the host theme selection — the ELEVATED `theme:set` action
 * (HOST_THEMING_SPEC §9.3). `theme` is the registry key of the theme to select,
 * `mode` is one of that theme's modes or `'system'`. The host applies it and
 * re-pushes the new selection to every `theme:read` iframe, so your own
 * {@link useHostThemeSelection} confirms the change (the loop closes with no
 * special case). Only a grant holding `theme:set` (e.g. the theme-toggle system
 * app) may call this; any other app is rejected host-side with a `forbidden`
 * {@link Error} (carrying `.code`), regardless of what the app claims.
 */
export const setHostThemeSelection = async (selection: { theme: string; mode: string }): Promise<void> => {
  await setTheme(selection);
};

/**
 * Set the host UI theme polarity — the LEGACY form of `theme:set` (§9.3). The host
 * applies that polarity to the CURRENT theme (never resets to the default), then
 * re-pushes. Keep this alias for old-SDK callers; new code should prefer
 * {@link setHostThemeSelection}.
 */
export const setHostTheme = async (theme: HostTheme): Promise<void> => {
  await setTheme({ theme });
};

/**
 * Add a theme source — the ELEVATED `theme:sources` `add-source` verb
 * (HOST_THEMING_SPEC §9.3). `location` must be a location the host journal saw a
 * RECENT open-bundle invocation OF THIS APP return (the picker-provenance rule —
 * "the pick is the consent", machine-checked); anything else is rejected with a
 * readable reason. The host fetches, gates, and registers the theme before
 * returning, so a rejected pick surfaces inline in the switcher. Only a grant
 * holding `theme:sources` (the theme switcher) may call this.
 */
export const addThemeSource = async (location: ThemeBundleLocation): Promise<void> => {
  const res = (await protocolRequest(SCHEMES[PROTOCOL_THEME], 'add-source', [{ location }])) as
    | { ok: true; data?: unknown }
    | { ok: false; code?: string; message?: string }
    | undefined;
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? 'addThemeSource failed') as Error & {
      code?: string;
    };
    err.code = (res && 'code' in res ? res.code : undefined) ?? 'unknown';
    throw err;
  }
};

/**
 * Remove a theme source — the `theme:sources` `remove-source` verb (§9.3). If the
 * removed theme is the current selection, the host falls back to the default theme
 * (keeping the mode selection where it exists). The default theme is never
 * removable. Only a grant holding `theme:sources` may call this.
 */
export const removeThemeSource = async (themeKey: string): Promise<void> => {
  const res = (await protocolRequest(SCHEMES[PROTOCOL_THEME], 'remove-source', [{ themeKey }])) as
    | { ok: true; data?: unknown }
    | { ok: false; code?: string; message?: string }
    | undefined;
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? 'removeThemeSource failed') as Error & {
      code?: string;
    };
    err.code = (res && 'code' in res ? res.code : undefined) ?? 'unknown';
    throw err;
  }
};
