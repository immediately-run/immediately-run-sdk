import { Fragment, jsx } from "react/jsx-runtime";
import { Children, isValidElement, use } from "react";
import { TinkerableContext } from "../TinkerableContext";
import { matchRoute } from "../routeMatch";
import { renderRoute } from "../routing";
const Route = (_props) => null;
const Routes = ({
  children,
  fallback = null
}) => {
  const context = use(TinkerableContext);
  const { sandboxPath } = context.navigationState;
  for (const child of Children.toArray(children)) {
    if (!isValidElement(child) || child.type !== Route) {
      continue;
    }
    const { path, element, component, name } = child.props;
    const params = matchRoute(path, sandboxPath);
    if (params) {
      const routingRule = { name, pattern: path, element, component };
      const scoped = {
        ...context,
        navigationState: { ...context.navigationState, routingRule, pathParameters: params }
      };
      return /* @__PURE__ */ jsx(TinkerableContext, { value: scoped, children: renderRoute(routingRule, params) });
    }
  }
  return /* @__PURE__ */ jsx(Fragment, { children: fallback });
};
export {
  Route,
  Routes
};
//# sourceMappingURL=Routes.js.map