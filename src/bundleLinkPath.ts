// R3-1324 — the bundle-link normaliser (REPO_CONTENT_DISPATCH_SPEC §9, "A relative link
// that leaves its bundle is a cross-bundle link").
//
// An author links between sibling bundles of one repository with the ordinary
// repository-relative path (`../spec/BATON_SPEC/06-x.md#r-btn-120` from `tickets/B-10.mdx`).
// The viewer never learns where its bundle lives, so it hands the host the target
// relative to the BUNDLE ROOT with its leading `..` segments intact; the host resolves it
// against the bundle's marker directory and confines it (R3-1321).
//
// Pure posix SEGMENT ARITHMETIC, deliberately — never `new URL` and never a URL library's
// normalize: WHATWG URL parsing collapses `..` and `%2e%2e` against the base, which is
// exactly the information this function exists to keep.
import { FS_PREFIX } from '@immediately-run/mdx-plugins';
import type { BundleLinkPayload } from './generated/protocol';

const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
/** A percent-encoded dot segment (`%2e`, `.%2e`, `%2E%2e`, …). Refused rather than
 *  decoded: a host that decodes later would read it as `.`/`..`, so its meaning would
 *  depend on who looked last. */
const ENCODED_DOT_SEGMENT = /^(?:\.|%2e){1,2}$/i;

const hasControlChar = (s: string): boolean => {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return true;
  }
  return false;
};

const hasLoneSurrogate = (s: string): boolean => {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) i++;
      else return true;
    } else if (c >= 0xdc00 && c <= 0xdfff) return true;
  }
  return false;
};

/** Why the host would refuse this escaping segment, or `undefined` when it takes it. The
 *  same tests as the host's `decodeSegment` (site-main `src/editor/bundleUrl.ts`, R3-1321),
 *  so the SDK never posts a payload the host is certain to drop. */
const segmentRefusal = (raw: string): string | undefined => {
  let s: string;
  try {
    s = decodeURIComponent(raw);
  } catch {
    return 'a segment has a malformed % escape';
  }
  if (s.includes('/') || s.includes('\\')) return 'a segment holds a separator (/ or \\) once decoded';
  if (hasControlChar(s)) return 'a segment holds a control character';
  if (hasLoneSurrogate(s)) return 'a segment holds a lone surrogate';
  return undefined;
};

type Segments = { ups: number; segs: string[] } | 'encoded-dot';

/** Fold `parts` onto `start` (`segs` under `ups` leading `..`). `'encoded-dot'` on a
 *  percent-encoded dot segment. */
function fold(start: { ups: number; segs: string[] }, parts: string[]): Segments {
  let ups = start.ups;
  const segs = [...start.segs];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (segs.length > 0) segs.pop();
      else ups += 1;
      continue;
    }
    if (ENCODED_DOT_SEGMENT.test(part)) return 'encoded-dot';
    segs.push(part);
  }
  return { ups, segs };
}

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
 *   segment (whether it leaves depends on who reads it), and one that leaves the bundle
 *   and carries a query or a second `#`, names only `..` segments, or has a segment the
 *   host refuses once decoded: a malformed `%` escape, a `/` or `\`, a control character
 *   or a lone surrogate. `onRefused` receives the reason.
 * - `{ path, fragment? }` — the target leaves the bundle. `path` is in normal form:
 *   one or more leading `..` segments, then clean segments (no `.`, no empty segment,
 *   no other `..`). `fragment` carries no `#` and is absent when empty.
 *
 * A root-absolute href (`/x`) is bundle-root-relative and clamps at the root, so it is
 * `'inside'` unless it carries a backslash or an encoded dot segment.
 */
export function bundleRelativeTarget(
  href: string,
  fromEntry: string,
  onRefused?: (reason: string) => void,
): BundleLinkPayload | 'inside' | 'refused' | null {
  if (href === '' || href.startsWith('#') || href.startsWith('//') || SCHEME.test(href)) return null;
  if (href.startsWith(FS_PREFIX)) return null; // the explicit filesystem space is not bundle-relative
  const refuse = (reason: string): 'refused' => {
    onRefused?.(reason);
    return 'refused';
  };
  const hash = href.indexOf('#');
  const beforeHash = hash === -1 ? href : href.slice(0, hash);
  const fragment = hash === -1 ? '' : href.slice(hash + 1);
  const query = beforeHash.indexOf('?');
  const pathPart = query === -1 ? beforeHash : beforeHash.slice(0, query);
  // A URL parser reads `\\` as `/`, so a caller routing this href as today could collapse
  // a `..` behind it; and the host refuses it. Refused wherever it stands.
  if (pathPart.includes('\\')) return refuse('it has a backslash');

  // The document's own directory, inside the bundle. An entry that is not itself
  // bundle-relative has no directory to resolve against.
  const entryDir = fold({ ups: 0, segs: [] }, fromEntry.split('/').slice(0, -1));
  if (entryDir === 'encoded-dot' || entryDir.ups > 0) return null;

  const target = fold(pathPart.startsWith('/') ? { ups: 0, segs: [] } : entryDir, pathPart.split('/'));
  if (target === 'encoded-dot') return refuse('it has a percent-encoded dot segment');
  if (pathPart.startsWith('/') || target.ups === 0) return 'inside';
  if (query !== -1) return refuse('it leaves the bundle with a query');
  if (fragment.includes('#')) return refuse('it leaves the bundle with a second #');
  if (target.segs.length === 0) return refuse('it lands on a directory and names no file');
  for (const seg of target.segs) {
    const reason = segmentRefusal(seg);
    if (reason) return refuse(reason);
  }
  const path = [...Array<string>(target.ups).fill('..'), ...target.segs].join('/');
  return fragment ? { path, fragment } : { path };
}
