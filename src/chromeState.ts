import { createPushChannel } from './pushChannel';
import { CHROME_STATE, REQUEST_CHROME_STATE } from './generated/protocol';

/**
 * What the immediately.run host's own chrome is currently doing over your app
 * (PRESENT_MODE_CHROME_SPEC §6). In run ("present") mode the platform shows a
 * single pull-down tab in one corner; activating it opens the platform menu —
 * an anchored panel on desktop, a bottom sheet on mobile — and the host dims
 * and slightly insets your app behind it.
 *
 * Reading this is **entirely optional**. No platform behavior depends on your
 * app consuming it, and an app that never reads it behaves identically
 * (R-PMC-18) — the platform never requires immediately.run knowledge of an app
 * (product value 3). It exists for the two things a cooperative app can do
 * better with it than without:
 *
 * - **Pause while dimmed.** `overlay === 'menu'` means the user is looking at
 *   platform chrome, not at you: a good moment to pause a video, an animation,
 *   or a polling loop.
 * - **Keep the corner clear.** `tab.edge` says where the platform's tab sits, so
 *   a floating control of your own can avoid overlapping it.
 *
 * Baseline capability `chrome:read` — every app may read it. It is a read of the
 * host's own UI state and discloses nothing app-foreign; there is deliberately no
 * counterpart that lets an app *operate* platform chrome.
 *
 * ```ts
 * import { onChromeStateChange } from '@immediately-run/sdk';
 *
 * onChromeStateChange(({ overlay }) => {
 *   if (overlay === 'menu') video.pause();
 * });
 * ```
 */
export interface ChromeState {
  /**
   * `'menu'` while the platform menu / bottom sheet (and its scrim) is open over
   * your app; `'none'` at rest. Edit mode reports `'none'` — the workbench chrome
   * is beside your app, not over it.
   */
  overlay: 'none' | 'menu';
  /** Where the platform's pull-down tab sits. Only one edge exists today. */
  tab: { edge: 'top-right' };
}

/**
 * Assumed before the host reports — and the value that stands forever on a host
 * that never pushes this channel (an older host, or one that does not paint
 * present-mode chrome at all). "Nothing is over you" is the safe default: an app
 * that gates a pause on it simply never pauses.
 */
const DEFAULT_CHROME_STATE: ChromeState = { overlay: 'none', tab: { edge: 'top-right' } };

const isChromeState = (v: unknown): v is ChromeState => {
  const c = v as Partial<ChromeState> | null;
  return (
    !!c &&
    (c.overlay === 'none' || c.overlay === 'menu') &&
    !!c.tab &&
    typeof c.tab === 'object' &&
    (c.tab as ChromeState['tab']).edge === 'top-right'
  );
};

// Read over the transport (SDK_PACKAGING_SPEC §4): the host pushes `chrome-state`
// and answers `request-chrome-state` (wire format: site-main channelBridge.ts).
const channel = createPushChannel<ChromeState>({
  pushType: CHROME_STATE,
  requestType: REQUEST_CHROME_STATE,
  initial: DEFAULT_CHROME_STATE,
  parse: (msg) => (isChromeState(msg.chromeState) ? (msg.chromeState as ChromeState) : undefined),
});

/** Returns the current chrome state. Poll for a one-off read. */
export const getChromeState = (): ChromeState => channel.get();

/**
 * Subscribe to chrome-state changes. The listener is invoked immediately with the
 * current value, then again on every change. Returns an unsubscribe fn.
 */
export const onChromeStateChange = (listener: (chromeState: ChromeState) => void): (() => void) =>
  channel.onChange(listener);

/** React hook returning the current chrome state, re-rendering on change. */
export const useChromeState = (): ChromeState => channel.use();
