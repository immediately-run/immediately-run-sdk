import "../chunk-VHAA22YE.js";
import { jsx } from "react/jsx-runtime";
import { useCallback, useLayoutEffect, useRef } from "react";
import { ensureProseStyles, PROSE_CLASS } from "../proseStyles.js";
import { tokensFor } from "../proseTokens.js";
import { useProseTokens } from "../proseTokensHook.js";
import { useHostTheme } from "../theme.js";
const assignRef = (ref, value) => {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
};
const Prose = ({ className, children, filename, ref, ...rest }) => {
  useLayoutEffect(() => {
    ensureProseStyles();
  }, []);
  const theme = useHostTheme();
  const tokens = useProseTokens(filename);
  const element = useRef(null);
  const setElement = useCallback(
    (node) => {
      element.current = node;
      assignRef(ref, node);
    },
    [ref]
  );
  useLayoutEffect(() => {
    const el = element.current;
    if (!el || !tokens) return;
    const entries = tokensFor(tokens, theme);
    for (const [name, value] of entries) el.style.setProperty(name, value);
    return () => {
      for (const [name] of entries) el.style.removeProperty(name);
    };
  }, [tokens, theme]);
  return /* @__PURE__ */ jsx(
    "article",
    {
      ...rest,
      ref: setElement,
      className: className ? `${PROSE_CLASS} ${className}` : PROSE_CLASS,
      "data-theme": theme,
      children
    }
  );
};
export {
  Prose
};
//# sourceMappingURL=Prose.js.map