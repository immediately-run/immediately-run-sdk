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
interface ChromeState {
    /**
     * `'menu'` while the platform menu / bottom sheet (and its scrim) is open over
     * your app; `'none'` at rest. Edit mode reports `'none'` — the workbench chrome
     * is beside your app, not over it.
     */
    overlay: 'none' | 'menu';
    /** Where the platform's pull-down tab sits. Only one edge exists today. */
    tab: {
        edge: 'top-right';
    };
}
/** Returns the current chrome state. Poll for a one-off read. */
declare const getChromeState: () => ChromeState;
/**
 * Subscribe to chrome-state changes. The listener is invoked immediately with the
 * current value, then again on every change. Returns an unsubscribe fn.
 */
declare const onChromeStateChange: (listener: (chromeState: ChromeState) => void) => (() => void);
/** React hook returning the current chrome state, re-rendering on change. */
declare const useChromeState: () => ChromeState;

export { type ChromeState, getChromeState, onChromeStateChange, useChromeState };
