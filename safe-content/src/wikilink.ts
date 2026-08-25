// Wikilink parsing for the safe content renderer (TRUST_MODES_SPEC §5.1). A §5.1
// residual: wikilinks resolve **only within the granted mount, never a fetch**. The
// kernel's executable pipeline compiles `[[target]]`/`[[label|target]]` to a
// `<WikiLink>` component (transpiler `remarkWikiLinks`, MARKDOWN_SYNTAX_SPEC §13); the
// SAFE renderer parses raw source, so it splits `[[…]]` out of text itself with the
// same byte-local rule and hands the raw target/label to an injected, **in-mount**
// resolver. The renderer never fetches; resolution is the consumer's mount-scoped
// callback (or, absent one, the link renders as inert text).

// Inner content up to the closing `]]`, forbidding `[`/`]` so nested brackets can't
// be swallowed. Global — a text run may hold several.
const WIKILINK = /\[\[([^[\]]+)\]\]/g;

export interface WikiLinkToken {
  /** The raw target path, verbatim (relative or absolute; resolved in-mount only). */
  target: string;
  /** The explicit label, or undefined (the component derives one). */
  label?: string;
}

export type WikiPart = { text: string } | { wiki: WikiLinkToken };

/** Parse the `[[label|target]]` / `[[target]]` inner text (label first, then target
 *  — the §13.1 order), or `null` for an empty target (leave the literal `[[…]]`). */
export function parseWikiInner(inner: string): WikiLinkToken | null {
  const pipe = inner.indexOf('|');
  let target: string;
  let label: string | undefined;
  if (pipe === -1) {
    target = inner.trim();
  } else {
    label = inner.slice(0, pipe).trim();
    target = inner.slice(pipe + 1).trim();
  }
  if (target === '') return null;
  return label ? { target, label } : { target };
}

/**
 * Split a text string on its `[[…]]` runs into ordered text / wiki parts, or `null`
 * when there is no usable wiki-link (so the caller keeps the text node untouched).
 */
export function splitWikiLinks(value: string): WikiPart[] | null {
  if (value.indexOf('[[') === -1) return null;
  const out: WikiPart[] = [];
  let lastIndex = 0;
  let produced = false;
  WIKILINK.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WIKILINK.exec(value)) !== null) {
    const token = parseWikiInner(match[1]);
    if (!token) continue; // empty target → keep the literal `[[…]]`
    if (match.index > lastIndex) out.push({ text: value.slice(lastIndex, match.index) });
    out.push({ wiki: token });
    lastIndex = match.index + match[0].length;
    produced = true;
  }
  if (!produced) return null;
  if (lastIndex < value.length) out.push({ text: value.slice(lastIndex) });
  return out;
}
