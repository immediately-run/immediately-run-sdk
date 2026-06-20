import { createContext, useContext, useMemo, createElement } from "react";
const emptyComponents = {};
const MDXContext = createContext(emptyComponents);
function useMDXComponents(components) {
  const contextComponents = useContext(MDXContext);
  return useMemo(
    function() {
      if (typeof components === "function") {
        return components(contextComponents);
      }
      return { ...contextComponents, ...components };
    },
    [contextComponents, components]
  );
}
function MDXProvider(properties) {
  let allComponents;
  if (properties.disableParentContext) {
    allComponents = typeof properties.components === "function" ? properties.components(emptyComponents) : properties.components || emptyComponents;
  } else {
    allComponents = useMDXComponents(properties.components);
  }
  return createElement(
    MDXContext.Provider,
    { value: allComponents },
    properties.children
  );
}
export {
  MDXProvider,
  useMDXComponents
};
//# sourceMappingURL=MDXProvider.js.map