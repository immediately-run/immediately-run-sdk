interface WikiLinkToken {
    /** The raw target path, verbatim (relative or absolute; resolved in-mount only). */
    target: string;
    /** The explicit label, or undefined (the component derives one). */
    label?: string;
}
type WikiPart = {
    text: string;
} | {
    wiki: WikiLinkToken;
};
/** Parse the `[[label|target]]` / `[[target]]` inner text (label first, then target
 *  — the §13.1 order), or `null` for an empty target (leave the literal `[[…]]`). */
declare function parseWikiInner(inner: string): WikiLinkToken | null;
/**
 * Split a text string on its `[[…]]` runs into ordered text / wiki parts, or `null`
 * when there is no usable wiki-link (so the caller keeps the text node untouched).
 */
declare function splitWikiLinks(value: string): WikiPart[] | null;

export { type WikiLinkToken, type WikiPart, parseWikiInner, splitWikiLinks };
