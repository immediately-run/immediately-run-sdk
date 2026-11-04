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
 * the document it appears in (e.g. `tickets/B-10.mdx`). When the href resolves OUTSIDE
 * the bundle, posts one `bundle-link` message to the host and returns `true`. Returns
 * `false` and sends nothing for an external href, a bare anchor, or a target inside the
 * bundle — route those as before.
 */
export function followBundleLink(href: string, fromEntry: string): boolean {
  const target = bundleRelativeTarget(href, fromEntry);
  if (target === null || target === 'inside') return false;
  const payload: BundleLinkPayload = target;
  sendMessage(BUNDLE_LINK, payload);
  return true;
}
