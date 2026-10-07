/**
 * Scroll the element addressed by a fragment id into view (deep-linking Capability
 * C, MARKDOWN_SYNTAX_SPEC §13.5). Tries the element's own `id` first — a heading's
 * `sec-…`/text-slug id (§15) — then the `[data-slug]` fallback, so a citation that
 * used the prose text slug still lands even when the heading's own id is the
 * prose-independent `sec-…` id. Returns whether a target was found; the caller
 * decides whether to fall back to top-of-page. **Never throws** — a missing
 * fragment is a soft failure, not an error.
 */
declare const scrollToId: (id: string) => boolean;

export { scrollToId };
