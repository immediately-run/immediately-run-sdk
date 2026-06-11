/**
 * The host UI theme, mirrored from the immediately.run host window into the
 * sandbox. Your app can read this to render in step with the host chrome
 * (light / dark).
 *
 * This is the baseline `theme:read` capability — every app may read it. Changing
 * the host theme is a separate, elevated action (`theme:set`), available only to
 * the theme-toggle system app.
 */
type HostTheme = 'light' | 'dark';
/**
 * Returns the current host theme. Poll this for a one-off read; use
 * {@link onHostThemeChange} or {@link useHostTheme} to react to changes.
 */
declare const getHostTheme: () => HostTheme;
/**
 * Subscribe to host theme changes. The listener is invoked immediately with the
 * current theme, then again on every change. Returns an unsubscribe fn.
 */
declare const onHostThemeChange: (listener: (theme: HostTheme) => void) => (() => void);
/**
 * React hook returning the current host theme, re-rendering when it changes.
 * The recommended way to implement an app's own `useTheme`: follow the host,
 * allow a local override.
 */
declare const useHostTheme: () => HostTheme;
/**
 * Set the host UI theme — the ELEVATED `theme:set` action (§8.5). The host
 * applies it and re-pushes the new value to every `theme:read` iframe, so your
 * own {@link useHostTheme} confirms the change (the loop closes with no special
 * case). Only a grant holding `theme:set` (e.g. the theme-toggle system app) may
 * call this; any other app is rejected host-side with a `forbidden`
 * {@link Error} (carrying `.code`), regardless of what the app claims. Update
 * optimistically and let the re-push confirm.
 */
declare const setHostTheme: (theme: HostTheme) => Promise<void>;

export { type HostTheme, getHostTheme, onHostThemeChange, setHostTheme, useHostTheme };
