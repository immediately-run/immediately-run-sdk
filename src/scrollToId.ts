/**
 * Scroll the element addressed by a fragment id into view (deep-linking Capability
 * C, MARKDOWN_SYNTAX_SPEC §13.5). Tries the element's own `id` first — a heading's
 * `sec-…`/text-slug id (§15) — then the `[data-slug]` fallback, so a citation that
 * used the prose text slug still lands even when the heading's own id is the
 * prose-independent `sec-…` id. Returns whether a target was found; the caller
 * decides whether to fall back to top-of-page. **Never throws** — a missing
 * fragment is a soft failure, not an error.
 */
export const scrollToId = (id: string): boolean => {
  if (!id || typeof document === 'undefined') return false;
  let el: Element | null = null;
  try {
    el = document.getElementById(id);
    if (!el) {
      // A citation that targeted the prose text slug still resolves via the
      // `data-slug` hook the kernel emits alongside the `sec-…` id.
      const escaped =
        typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(id) : id.replace(/["\\]/g, '\\$&');
      el = document.querySelector(`[data-slug="${escaped}"]`);
    }
  } catch {
    return false;
  }
  if (el && typeof (el as HTMLElement).scrollIntoView === 'function') {
    (el as HTMLElement).scrollIntoView();
    return true;
  }
  return false;
};
