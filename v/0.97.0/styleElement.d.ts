/**
 * Insert `<style id={id}>{text}</style>` into `<head>` unless one with that id exists.
 * Idempotent and browser-only (a no-op without `document`).
 *
 * `first: true` puts it before every other stylesheet. A sheet whose rules sit in a
 * cascade layer needs that: layers rank by the order they first appear, later layers
 * winning, so an appended layered sheet would outrank the app's own layers.
 */
declare function ensureStyleElement(id: string, text: string, options?: {
    first?: boolean;
}): void;

export { ensureStyleElement };
