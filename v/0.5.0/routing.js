import { use, useContext } from "react";
import { sendMessage } from "./sandboxUtils";
import { TinkerableContext } from "./TinkerableContext";
import { constructUrl, isAbsolutePath, parseTarget } from "./urlUtils";
import { joinPaths } from "./pathUtils";
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
    if (typeof routingRule.pattern === "string") {
      if (routingRule.pattern === sandboxPath) {
        return { routingRule };
      }
    } else {
      const match = sandboxPath.match(routingRule.pattern);
      if (routingRule.pattern.test(sandboxPath)) {
        return {
          routingRule,
          pathParameters: match?.groups
        };
      }
    }
  }
  return void 0;
};
const Router = () => {
  const context = useContext(TinkerableContext);
  const { navigationState: { routingRule } } = context;
  if (!routingRule) {
    throw new Error(`No route registered for path ${context.navigationState.sandboxPath}!`);
  }
  return routingRule.reactNode;
};
const navigate = (target) => {
  console.log(`[Sandbox] Navigating to ${target}`);
  sendMessage("urlchange", {
    url: target,
    back: false,
    forward: false
  });
};
export {
  Router,
  applyRoutingRule,
  navigate,
  useTinkerableLink
};
//# sourceMappingURL=routing.js.map