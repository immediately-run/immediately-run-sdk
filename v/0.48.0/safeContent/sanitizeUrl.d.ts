/**
 * Return the URL if its scheme is allowed (or it is relative/anchor), else
 * `undefined`. Control chars are stripped first so an obfuscated scheme cannot slip
 * past. A protocol-relative `//host` URL is treated as relative-with-authority and
 * allowed (it inherits the page's https scheme).
 */
declare function sanitizeUrl(url: unknown): string | undefined;

export { sanitizeUrl };
