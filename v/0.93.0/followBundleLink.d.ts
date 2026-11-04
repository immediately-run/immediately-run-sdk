/**
 * Follow a link that leaves the current bundle.
 *
 * `href` is the link as the author wrote it; `fromEntry` is the bundle-relative path of
 * the document it appears in (e.g. `tickets/B-10.mdx`).
 *
 * - Returns `true` when the href resolves OUTSIDE the bundle: one `bundle-link` message
 *   is posted to the host.
 * - Also returns `true`, posting nothing, for a link `bundleRelativeTarget` refuses: one
 *   with a backslash or a percent-encoded dot segment in its path, or one that leaves the bundle with
 *   a query, a second `#`, only `..` segments, or a segment the host would refuse once
 *   decoded. The click is consumed and one `console.warn` names the reason. Do not
 *   route it as before, because URL parsing would collapse its `..` into a wrong path
 *   inside the bundle. Render it as a broken link instead.
 * - Returns `false`, posting nothing, for an external href, a bare anchor, or a target
 *   inside the bundle. Route those as before.
 */
declare function followBundleLink(href: string, fromEntry: string): boolean;

export { followBundleLink };
