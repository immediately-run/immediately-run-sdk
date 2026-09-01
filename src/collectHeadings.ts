// The headings index extension (GROVE_AGENT_SPEC §4): `headings: [{id, text, depth}]`
// computed from an entry's BODY with the same `@immediately-run/mdx-plugins`
// heading-anchor canon the render paths use — so an index heading's id IS the id a
// reader's `#fragment` lands on, and section-level questions are answerable from the
// index without body reads.
//
// IDS CANNOT DRIFT: every id is `headingId(text, { sectionIds })` from mdx-plugins,
// with the same in-document duplicate counter (`baseId-2`, `-3`, …) the remark pass
// applies. What this module adds is the WALK — a byte-level ATX scan used where the
// remark tree is not at hand (the bundler's metadata scan, a dispatched corpus scan).
// It walks only what corpus entries actually contain: top-level ATX headings
// (`#`–`######`) outside fenced code blocks; headings carrying an author id
// (MDX `{#…}`/JSX) are invisible to a byte scan and stay the remark pass's to own.
//
// Additive by design: an older index simply lacks `headings`, and readers degrade to
// body reads (ways_of_working §6).

import { headingId } from '@immediately-run/mdx-plugins';
import type { HeadingSummary } from './metadataQueryTool';

export type { HeadingSummary };

/**
 * Collect an entry's headings from its MDX/Markdown BODY (frontmatter already
 * stripped — `parseFrontmatter(...).body`).
 *
 * Inline markup is flattened the way the remark pass flattens it (`## The **bold**
 * heading` → "The bold heading"), code fences are skipped, and ids follow the canon
 * with per-document duplicate suffixes.
 */
export function collectHeadings(body: string, opts: { sectionIds?: boolean } = {}): HeadingSummary[] {
  const sectionIds = opts.sectionIds !== false;
  const seen = new Map<string, number>();
  const out: HeadingSummary[] = [];

  let fenceMarker: string | null = null; // inside a ``` or ~~~ block
  for (const line of body.split('\n')) {
    const fenceMatch = /^(\s{0,3})(`{3,}|~{3,})/.exec(line);
    if (fenceMarker) {
      if (fenceMatch && line.trim().startsWith(fenceMarker)) fenceMarker = null;
      continue;
    }
    if (fenceMatch) {
      fenceMarker = fenceMatch[2][0].repeat(3);
      continue;
    }
    const h = /^(#{1,6})[ \t]+(\S.*)$/.exec(line);
    if (!h) continue;
    const text = flattenInline(h[2].trim());
    if (!text) continue;
    const baseId = headingId(text, { sectionIds });
    const n = seen.get(baseId) ?? 0;
    seen.set(baseId, n + 1);
    const id = n === 0 ? baseId : `${baseId}-${n}`;
    out.push({ id, text, depth: h[1].length });
  }
  return out;
}

/** Flatten inline markup the way `headingText` does in the remark pass: emphasis and
 * code markers drop, link/image syntax keeps its text. Covers what corpus headings
 * actually carry; anything else passes through verbatim (and the id canon slugifies
 * punctuation anyway). */
function flattenInline(s: string): string {
  return s
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // [text](url) / ![alt](url) → text
    .replace(/`([^`]*)`/g, '$1') // `code` → code
    .replace(/\*\*([^*]+)\*\*/g, '$1') // **bold** → bold
    .replace(/\*([^*]+)\*/g, '$1') // *em* → em
    .replace(/__([^_]+)__/g, '$1') // __bold__ → bold
    .replace(/_([^_]+)_/g, '$1'); // _em_ → em
}
