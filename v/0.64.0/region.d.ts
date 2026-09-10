/**
 * The chrome region this app instance is mounted in (e.g. `"panel.agent"`,
 * `"stage.conversation"`), or `null` when unknown — a standalone app, local
 * `vite dev`, or an older host that doesn't report it.
 */
declare const getRegion: () => string | null;
/**
 * React hook form of {@link getRegion}. The region is fixed for an app instance's
 * lifetime, but the discovery global can arrive just after first paint, so this
 * re-reads once the host runtime's `ready` promise resolves.
 */
declare const useRegion: () => string | null;
/**
 * Whether the host has hidden this app's region — it is still mounted and running,
 * but off screen and `inert`, so the user can neither see it nor interact with it.
 *
 * `false` when the host says nothing (a standalone app, `vite dev`, an older host).
 */
declare const isRegionHidden: () => boolean;
/**
 * Subscribe to this region's visibility. The listener is invoked immediately with the
 * current value, then on every change. Returns an unsubscribe fn.
 *
 * Use it to STOP doing what the user is supposed to be watching, at your own safe
 * boundary — never mid-operation. An agent loop pauses between turns, so every
 * `tool_use` still has its `tool_result`; a poller stops polling; an animation stops
 * animating. Do not use it to hide UI: the host has already done that.
 */
declare const onRegionVisibilityChange: (listener: (hidden: boolean) => void) => (() => void);
/** React hook form of {@link isRegionHidden}, re-rendering on change. */
declare const useRegionHidden: () => boolean;

export { getRegion, isRegionHidden, onRegionVisibilityChange, useRegion, useRegionHidden };
