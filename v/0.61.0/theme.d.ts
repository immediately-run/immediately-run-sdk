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
type HostTheme = 'light' | 'dark';
/**
 * The full host theme selection (HOST_THEMING_SPEC §2/§9.1): the resolved polarity
 * plus the active theme's registry key and resolved mode. Carried on the widened
 * `theme` push. `modeId` is always the RESOLVED mode (never the literal `system` —
 * an app wants to know what is on screen).
 */
interface HostThemeSelection {
    /** Resolved polarity — the same value the legacy `theme` field carried. */
    theme: HostTheme;
    /** The host-minted registry key of the active theme. */
    themeKey: string;
    /** The resolved active mode id of the active theme. */
    modeId: string;
}
/**
 * Returns the current host theme polarity. Poll this for a one-off read; use
 * {@link onHostThemeChange} or {@link useHostTheme} to react to changes.
 */
declare const getHostTheme: () => HostTheme;
/**
 * Subscribe to host theme polarity changes. The listener is invoked immediately
 * with the current polarity, then again on every change. Returns an unsubscribe fn.
 */
declare const onHostThemeChange: (listener: (theme: HostTheme) => void) => (() => void);
/**
 * React hook returning the current host theme polarity, re-rendering when it
 * changes. The recommended way to implement an app's own `useTheme`: follow the
 * host, allow a local override.
 */
declare const useHostTheme: () => HostTheme;
/**
 * Returns the current full host theme selection — polarity, active theme key, and
 * resolved mode. Use {@link useHostThemeSelection} to react to changes.
 */
declare const getHostThemeSelection: () => HostThemeSelection;
/**
 * Subscribe to full host theme selection changes. The listener is invoked
 * immediately with the current selection, then again on every change. Returns an
 * unsubscribe fn.
 */
declare const onHostThemeSelectionChange: (listener: (selection: HostThemeSelection) => void) => (() => void);
/** React hook returning the current full host theme selection. */
declare const useHostThemeSelection: () => HostThemeSelection;
/**
 * One entry of the theme catalogue: a selectable theme and its modes. The
 * catalogue is projected per grant — the baseline `theme:read` projection carries
 * NO source identities (no repo coordinates, no spaceIds), and labels are bounded.
 */
interface ThemeCatalogEntry {
    themeKey: string;
    label: string;
    modes: {
        id: string;
        polarity: 'light' | 'dark';
    }[];
}
/**
 * The loaded-theme catalogue (HOST_THEMING_SPEC §9.2): every selectable theme, so
 * a theme-aware app can render a picker and match chrome. Pushed on
 * `theme-catalog` / polled with `request-theme-catalog`.
 */
interface ThemeCatalog {
    themes: ThemeCatalogEntry[];
}
/**
 * Returns the current theme catalogue (themes + their modes). Use
 * {@link useThemeCatalog} to react to changes.
 */
declare const getThemeCatalog: () => ThemeCatalog;
/**
 * Subscribe to theme catalogue changes. The listener is invoked immediately with
 * the current catalogue, then again on every change. Returns an unsubscribe fn.
 */
declare const onThemeCatalogChange: (listener: (catalog: ThemeCatalog) => void) => (() => void);
/** React hook returning the current theme catalogue. */
declare const useThemeCatalog: () => ThemeCatalog;
/**
 * A location the open-bundle picker returned — a repo or a space, with a
 * confined in-bundle path (OPEN_BUNDLE_SPEC §2). Carried to the host's
 * `theme:sources` `add-source` verb.
 */
type ThemeBundleLocation = {
    kind: 'repo';
    repo: string;
    ref?: string;
    path: string;
} | {
    kind: 'space';
    spaceId: string;
    path: string;
};
/**
 * The canonical `theme:set` params (HOST_THEMING_SPEC §9.3). `theme` is the
 * registry key of the theme to select (or the legacy `'light' | 'dark'` polarity —
 * the host disambiguates by the reserved-id rule: legacy iff the value is
 * light/dark AND `mode` is absent). `mode` is one of that theme's modes or
 * `'system'`.
 */
interface SetHostThemeSelectionParams {
    theme: string;
    mode?: string;
}
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
declare const setHostThemeSelection: (selection: {
    theme: string;
    mode: string;
}) => Promise<void>;
/**
 * Set the host UI theme polarity — the LEGACY form of `theme:set` (§9.3). The host
 * applies that polarity to the CURRENT theme (never resets to the default), then
 * re-pushes. Keep this alias for old-SDK callers; new code should prefer
 * {@link setHostThemeSelection}.
 */
declare const setHostTheme: (theme: HostTheme) => Promise<void>;
/**
 * Add a theme source — the ELEVATED `theme:sources` `add-source` verb
 * (HOST_THEMING_SPEC §9.3). `location` must be a location the host journal saw a
 * RECENT open-bundle invocation OF THIS APP return (the picker-provenance rule —
 * "the pick is the consent", machine-checked); anything else is rejected with a
 * readable reason. The host fetches, gates, and registers the theme before
 * returning, so a rejected pick surfaces inline in the switcher. Only a grant
 * holding `theme:sources` (the theme switcher) may call this.
 */
declare const addThemeSource: (location: ThemeBundleLocation) => Promise<void>;
/**
 * Remove a theme source — the `theme:sources` `remove-source` verb (§9.3). If the
 * removed theme is the current selection, the host falls back to the default theme
 * (keeping the mode selection where it exists). The default theme is never
 * removable. Only a grant holding `theme:sources` may call this.
 */
declare const removeThemeSource: (themeKey: string) => Promise<void>;

export { type HostTheme, type HostThemeSelection, type SetHostThemeSelectionParams, type ThemeBundleLocation, type ThemeCatalog, type ThemeCatalogEntry, addThemeSource, getHostTheme, getHostThemeSelection, getThemeCatalog, onHostThemeChange, onHostThemeSelectionChange, onThemeCatalogChange, removeThemeSource, setHostTheme, setHostThemeSelection, useHostTheme, useHostThemeSelection, useThemeCatalog };
