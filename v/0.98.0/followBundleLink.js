import "./chunk-VHAA22YE.js";
import { sendMessage } from "./sandboxUtils.js";
import { BUNDLE_LINK } from "./generated/protocol.js";
import { bundleRelativeTarget } from "./bundleLinkPath.js";
function followBundleLink(href, fromEntry) {
  let reason = "";
  const target = bundleRelativeTarget(href, fromEntry, (r) => {
    reason = r;
  });
  if (target === null || target === "inside") return false;
  if (target === "refused") {
    console.warn(
      `followBundleLink: not following ${JSON.stringify(href)} from ${JSON.stringify(fromEntry)}: ${reason}`
    );
    return true;
  }
  const payload = target;
  sendMessage(BUNDLE_LINK, payload);
  return true;
}
export {
  followBundleLink
};
//# sourceMappingURL=followBundleLink.js.map