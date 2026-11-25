// The one inject-once `<style>` guard the SDK's self-styling components share
// (`loading.tsx`, `proseStyles.ts`). A published library cannot import a CSS file in the
// sandbox — the bundler evaluates a dist CSS import as JavaScript — so each stylesheet is
// text the component injects itself.

/**
 * Insert `<style id={id}>{text}</style>` into `<head>` unless one with that id exists.
 * Idempotent and browser-only (a no-op without `document`).
 *
 * `first: true` puts it before every other stylesheet. A sheet whose rules sit in a
 * cascade layer needs that: layers rank by the order they first appear, later layers
 * winning, so an appended layered sheet would outrank the app's own layers.
 */
export function ensureStyleElement(id: string, text: string, options: { first?: boolean } = {}): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(id)) return;
  const el = document.createElement('style');
  el.id = id;
  el.textContent = text;
  if (options.first) document.head.prepend(el);
  else document.head.appendChild(el);
}
