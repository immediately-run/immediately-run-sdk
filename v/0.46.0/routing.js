import "./chunk-VHAA22YE.js";
import { jsx } from "react/jsx-runtime";
import { use, useContext } from "react";
import { sendMessage } from "./sandboxUtils";
import { TinkerableContext } from "./TinkerableContext";
import { matchRoute } from "./routeMatch";
import { constructUrl, isAbsolutePath, parseTarget } from "./urlUtils";
import { joinPaths } from "./pathUtils";
import { URLCHANGE } from "./generated/protocol";
const useTinkerableLink = (newSandboxLocation) => {
  const { outerHref, navigationState: navigation } = use(TinkerableContext);
  let newNavigationState = parseTarget(newSandboxLocation, navigation);
  if (!isAbsolutePath(newSandboxLocation)) {
    newNavigationState.sandboxPath = joinPaths(navigation.sandboxPath, newSandboxLocation);
  } else {
    newNavigationState.sandboxPath = newSandboxLocation;
  }
  return constructUrl(outerHref, newNavigationState);
};
const applyRoutingRule = (routingSpec, navigationState) => {
  const { sandboxPath } = navigationState;
  for (const routingRule of routingSpec.routes) {
    const pathParameters = matchRoute(routingRule.pattern, sandboxPath);
    if (pathParameters) {
      return { routingRule, pathParameters };
    }
  }
  return void 0;
};
const renderRoute = (routingRule, params) => {
  if (routingRule.component) {
    const Component = routingRule.component;
    return /* @__PURE__ */ jsx(Component, { params });
  }
  return routingRule.element ?? routingRule.reactNode ?? null;
};
const Router = () => {
  const context = useContext(TinkerableContext);
  const { navigationState: { routingRule, pathParameters } } = context;
  if (!routingRule) {
    throw new Error(`No route registered for path ${context.navigationState.sandboxPath}!`);
  }
  return renderRoute(routingRule, pathParameters ?? {});
};
const useRouteParams = () => use(TinkerableContext).navigationState.pathParameters ?? {};
const useRoute = () => {
  const { navigationState } = use(TinkerableContext);
  const { routingRule, pathParameters, sandboxPath, mode, provider, namespace, repository, ref } = navigationState;
  return {
    name: routingRule?.name,
    params: pathParameters ?? {},
    sandboxPath,
    mode,
    provider,
    namespace,
    repository,
    ref
  };
};
let viewedDocumentResolver = null;
const setViewedDocumentResolver = (resolver) => {
  viewedDocumentResolver = resolver;
};
const navigate = (target, opts) => {
  console.log(`[Sandbox] Navigating to ${target}`);
  let declared = {};
  if (opts && "viewedDocument" in opts) {
    declared = { viewedDocument: opts.viewedDocument ?? null };
  } else if (viewedDocumentResolver) {
    try {
      const v = viewedDocumentResolver(target);
      if (v !== void 0) declared = { viewedDocument: v };
    } catch {
    }
  }
  sendMessage(URLCHANGE, {
    url: target,
    back: false,
    forward: false,
    ...declared
  });
};
export {
  Router,
  applyRoutingRule,
  navigate,
  renderRoute,
  setViewedDocumentResolver,
  useRoute,
  useRouteParams,
  useTinkerableLink
};
//# sourceMappingURL=routing.js.map