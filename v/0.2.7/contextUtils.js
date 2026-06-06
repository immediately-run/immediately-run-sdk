import { parseHref, getSearchParams } from "./urlUtils";
import { applyRoutingRule } from "./routing";
const getContextFromUrl = (routingSpec, outerHref, filesMetadata) => {
  const navigationState = parseHref(outerHref);
  const appliedRoutingRule = applyRoutingRule(routingSpec, navigationState);
  if (!appliedRoutingRule) {
    throw new Error(`No route registered for path ${navigationState.sandboxPath}!`);
  }
  return {
    filesMetadata: filesMetadata ?? {},
    routingSpec,
    outerHref,
    navigationState: {
      ...navigationState,
      ...appliedRoutingRule
    }
  };
};
const getInitialContext = (routingSpec) => {
  const searchParams = getSearchParams();
  return () => getContextFromUrl(routingSpec, searchParams["href"]);
};
const updateContext = (context, href) => {
  if (href === context.outerHref) {
    return context;
  }
  return getContextFromUrl(context.routingSpec, href, context.filesMetadata);
};
export {
  getContextFromUrl,
  getInitialContext,
  updateContext
};
//# sourceMappingURL=contextUtils.js.map