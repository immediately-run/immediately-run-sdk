import "./chunk-VHAA22YE.js";
import { jsx } from "react/jsx-runtime";
import { createContext, use, useMemo } from "react";
import { TinkerableContext } from "./TinkerableContext";
const MetadataSourceContext = createContext(void 0);
const MetadataSource = ({
  value,
  mode = "replace",
  children
}) => {
  const outer = use(MetadataSourceContext);
  const host = use(TinkerableContext);
  const provided = useMemo(() => {
    if (mode !== "merge") return { filesMetadata: value };
    const base = outer?.filesMetadata ?? host?.filesMetadata ?? {};
    return { filesMetadata: { ...base, ...value } };
  }, [value, mode, outer, host]);
  return /* @__PURE__ */ jsx(MetadataSourceContext.Provider, { value: provided, children });
};
const useMetadataStore = () => {
  const source = use(MetadataSourceContext);
  const host = use(TinkerableContext);
  return source?.filesMetadata ?? host?.filesMetadata ?? {};
};
export {
  MetadataSource,
  useMetadataStore
};
//# sourceMappingURL=metadataSource.js.map