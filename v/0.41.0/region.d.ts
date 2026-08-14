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

export { getRegion, useRegion };
