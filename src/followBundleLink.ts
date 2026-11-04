// R3-1324 — hand the host a link that leaves the app's bundle (REPO_CONTENT_DISPATCH_SPEC
// §9). The normalisation lives in `bundleLinkPath.ts`; this is the thin wrapper that posts.
//
// `bundle-link` is FIRE-AND-FORGET on purpose: a host that predates the message ignores
// it (an unknown name gets no reply), and a request would hang its caller there. The
// message carries a path and nothing else — the host decides, on its own gesture bit,
// whether to navigate (R3-1321).
import { sendMessage } from './sandboxUtils';
import { BUNDLE_LINK } from './generated/protocol';
import type { BundleLinkPayload } from './generated/protocol';
import { bundleRelativeTarget } from './bundleLinkPath';

/**
 * Follow a link that leaves the current bundle.
 *
 * `href` is the link as the author wrote it; `fromEntry` is the bundle-relative path of
 * the document it appears in (e.g. `tickets/B-10.mdx`).
 *
 * - Returns `true` when the href resolves OUTSIDE the bundle: one `bundle-link` message
 *   is posted to the host.
 * - Also returns `true`, posting nothing, for a link `bundleRelativeTarget` refuses: one
 *   with a backslash or a percent-encoded dot segment, or one that leaves the bundle with
 *   a query, a second `#`, only `..` segments, or a segment the host would refuse once
 *   decoded. The click is consumed and one `console.warn` names the reason. Do not
 *   route it as before, because URL parsing would collapse its `..` into a wrong path
 *   inside the bundle. Render it as a broken link instead.
 * - Returns `false`, posting nothing, for an external href, a bare anchor, or a target
 *   inside the bundle. Route those as before.
 */
export function followBundleLink(href: string, fromEntry: string): boolean {
  let reason = '';
  const target = bundleRelativeTarget(href, fromEntry, (r) => {
    reason = r;
  });
  if (target === null || target === 'inside') return false;
  if (target === 'refused') {
    console.warn(
      `followBundleLink: not following ${JSON.stringify(href)} from ${JSON.stringify(fromEntry)}: ${reason}`,
    );
    return true;
  }
  const payload: BundleLinkPayload = target;
  sendMessage(BUNDLE_LINK, payload);
  return true;
}
