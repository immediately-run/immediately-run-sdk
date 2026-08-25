// URL-scheme sanitizer for the safe content renderer (TRUST_MODES_SPEC §5.1,
// AGENT_AUTHORING §10). A §5.1 residual requirement: link/image URLs in untrusted
// content are allowlisted to `http`/`https`/`mailto` and relative URLs; every other
// scheme — `javascript:`, `data:`, `vbscript:`, `file:`, … — is rejected. We do NOT
// rely on React to neutralize `javascript:` (it does not, on an `<a href>`), so this
// is the single chokepoint every rendered `href`/`src` passes through.

// A leading `scheme:` per RFC 3986 (`ALPHA *( ALPHA / DIGIT / "+" / "-" / "." )`).
// Anything before the first `:` that matches this is an absolute-URI scheme; if the
// URL has no such prefix it is relative (path/query/fragment) and allowed.
const SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;
const ALLOWED_SCHEMES = new Set(['http', 'https', 'mailto']);

// ASCII control chars (0x00–0x1F, 0x7F) that browsers ignore INSIDE a scheme — the
// `java\tscript:` / `java\nscript:` obfuscation — stripped anywhere before testing.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

/**
 * Return the URL if its scheme is allowed (or it is relative/anchor), else
 * `undefined`. Control chars are stripped first so an obfuscated scheme cannot slip
 * past. A protocol-relative `//host` URL is treated as relative-with-authority and
 * allowed (it inherits the page's https scheme).
 */
export function sanitizeUrl(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined;
  const cleaned = url.replace(CONTROL_CHARS, '').trim();
  if (cleaned === '') return undefined;
  const m = SCHEME.exec(cleaned);
  if (!m) return cleaned; // no scheme → relative / anchor / query — allowed
  return ALLOWED_SCHEMES.has(m[1].toLowerCase()) ? cleaned : undefined;
}
