import { BundleLinkPayload } from '@immediately-run/sandbox-protocol/sdk';

/**
 * Resolve `href`, as written in the document at the bundle-relative path `fromEntry`,
 * into a bundle-relative target.
 *
 * - `null` — not ours to route: an external href (any scheme, or `//host`), a bare
 *   anchor (`#x`), a `$fs:` href, an empty href, or a `fromEntry` that is not itself
 *   bundle-relative.
 * - `'inside'` — the target stays inside the bundle; the caller routes it as today.
 * - `'refused'` — a relative href this function will not hand to the host, and which must
 *   not be routed as today either, because URL parsing would collapse its `..` into a
 *   wrong in-bundle path. That is any href with a backslash or a percent-encoded dot
 *   segment in its path (whether it leaves depends on who reads it; the fragment is not
 *   checked), and one that leaves the bundle
 *   and carries a query or a second `#`, names only `..` segments, or has a segment the
 *   host refuses once decoded: a malformed `%` escape, a `/` or `\`, a control character
 *   or a lone surrogate. `onRefused` receives the reason.
 * - `{ path, fragment? }` — the target leaves the bundle. `path` is in normal form:
 *   one or more leading `..` segments, then clean segments (no `.`, no empty segment,
 *   no other `..`). `fragment` carries no `#` and is absent when empty.
 *
 * A root-absolute href (`/x`) is bundle-root-relative and clamps at the root, so it is
 * `'inside'` unless its path carries a backslash or an encoded dot segment.
 */
declare function bundleRelativeTarget(href: string, fromEntry: string, onRefused?: (reason: string) => void): BundleLinkPayload | 'inside' | 'refused' | null;

export { bundleRelativeTarget };
