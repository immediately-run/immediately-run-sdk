import { useEffect, useState } from 'react';

/**
 * The host UI theme, mirrored from the immediately.run host window into the
 * sandbox. Your app can read this to render in step with the host chrome
 * (light / dark).
 *
 * This is the baseline `theme:read` capability — every app may read it. Changing
 * the host theme is a separate, elevated action (`theme:set`), available only to
 * the theme-toggle system app.
 */
export type HostTheme = 'light' | 'dark';

interface ThemeService {
  getTheme(): HostTheme;
  onChange(listener: (theme: HostTheme) => void): { dispose(): void };
}

// `module.evaluation.module.bundler.theme` is the sandbox bundler injected into
// the evaluation context (same path the other SDK helpers use for `auth`).
const themeService = (): ThemeService => {
  // @ts-ignore - injected by the sandbox runtime
  return module.evaluation.module.bundler.theme;
};

/**
 * Returns the current host theme. Poll this for a one-off read; use
 * {@link onHostThemeChange} or {@link useHostTheme} to react to changes.
 */
export const getHostTheme = (): HostTheme => themeService().getTheme();

/**
 * Subscribe to host theme changes. The listener is invoked immediately with the
 * current theme, then again on every change. Returns an unsubscribe fn.
 */
export const onHostThemeChange = (
  listener: (theme: HostTheme) => void,
): (() => void) => {
  const disposable = themeService().onChange(listener);
  return () => disposable.dispose();
};

/**
 * React hook returning the current host theme, re-rendering when it changes.
 * The recommended way to implement an app's own `useTheme`: follow the host,
 * allow a local override.
 */
export const useHostTheme = (): HostTheme => {
  const [theme, setTheme] = useState<HostTheme>(getHostTheme);
  useEffect(() => onHostThemeChange(setTheme), []);
  return theme;
};
