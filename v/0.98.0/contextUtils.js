import "./chunk-VHAA22YE.js";
import { acceptFilesHrefBase, parseHref, getSearchParams } from "./urlUtils.js";
import { applyRoutingRule } from "./routing.js";
import { getInjectedMetadataSnapshot } from "./injectedBundler.js";
const getContextFromUrl = (routingSpec, outerHref, filesMetadata, filesHrefBase) => {
  const navigationState = parseHref(outerHref);
  const appliedRoutingRule = applyRoutingRule(routingSpec, navigationState);
  if (!appliedRoutingRule) {
    throw new Error(`No route registered for path ${navigationState.sandboxPath}!`);
  }
  return {
    filesMetadata: filesMetadata ?? {},
    routingSpec,
    outerHref,
    filesHrefBase: acceptFilesHrefBase(filesHrefBase, outerHref),
    navigationState: {
      ...navigationState,
      ...appliedRoutingRule
    }
  };
};
const getInitialContext = (routingSpec) => {
  const searchParams = getSearchParams();
  return () => getContextFromUrl(
    routingSpec,
    searchParams["href"],
    getInjectedMetadataSnapshot() ?? void 0,
    searchParams["filesHrefBase"]
  );
};
const updateContext = (context, href, filesHrefBase) => {
  const base = acceptFilesHrefBase(filesHrefBase, href);
  if (href === context.outerHref && base === (context.filesHrefBase ?? null)) {
    return context;
  }
  return getContextFromUrl(context.routingSpec, href, context.filesMetadata, base);
};
export {
  getContextFromUrl,
  getInitialContext,
  updateContext
};
//# sourceMappingURL=contextUtils.js.map