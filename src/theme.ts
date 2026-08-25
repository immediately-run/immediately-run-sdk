import { createPushChannel } from './pushChannel';
import { protocolRequest } from './sandboxUtils';
import { PROTOCOL_THEME, REQUEST_THEME, THEME } from './generated/protocol';
import { SCHEMES } from './protocolSchemes';

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

// Read over the transport (SDK_PACKAGING_SPEC §4): the host pushes `theme` and
// answers `request-theme` (wire format: site-main channelBridge.ts). The host's
// default before it reports is `dark` (sandbox themeState.DEFAULT_THEME).
const channel = createPushChannel<HostTheme>({
  pushType: THEME,
  requestType: REQUEST_THEME,
  initial: 'dark',
  parse: (msg) => (msg.theme === 'light' || msg.theme === 'dark' ? msg.theme : undefined),
});

/**
 * Returns the current host theme. Poll this for a one-off read; use
 * {@link onHostThemeChange} or {@link useHostTheme} to react to changes.
 */
export const getHostTheme = (): HostTheme => channel.get();

/**
 * Subscribe to host theme changes. The listener is invoked immediately with the
 * current theme, then again on every change. Returns an unsubscribe fn.
 */
export const onHostThemeChange = (listener: (theme: HostTheme) => void): (() => void) => channel.onChange(listener);

/**
 * React hook returning the current host theme, re-rendering when it changes.
 * The recommended way to implement an app's own `useTheme`: follow the host,
 * allow a local override.
 */
export const useHostTheme = (): HostTheme => channel.use();

/**
 * Set the host UI theme — the ELEVATED `theme:set` action (§8.5). The host
 * applies it and re-pushes the new value to every `theme:read` iframe, so your
 * own {@link useHostTheme} confirms the change (the loop closes with no special
 * case). Only a grant holding `theme:set` (e.g. the theme-toggle system app) may
 * call this; any other app is rejected host-side with a `forbidden`
 * {@link Error} (carrying `.code`), regardless of what the app claims. Update
 * optimistically and let the re-push confirm.
 */
export const setHostTheme = async (theme: HostTheme): Promise<void> => {
  const res = (await protocolRequest(SCHEMES[PROTOCOL_THEME], 'set', [{ theme }])) as
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
