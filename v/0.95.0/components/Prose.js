import "../chunk-VHAA22YE.js";
import { jsx } from "react/jsx-runtime";
import { useLayoutEffect } from "react";
import { ensureProseStyles, PROSE_CLASS } from "../proseStyles.js";
import { useHostTheme } from "../theme.js";
const Prose = ({ className, children, ...rest }) => {
  useLayoutEffect(() => {
    ensureProseStyles();
  }, []);
  const theme = useHostTheme();
  return /* @__PURE__ */ jsx("article", { ...rest, className: className ? `${PROSE_CLASS} ${className}` : PROSE_CLASS, "data-theme": theme, children });
};
export {
  Prose
};
//# sourceMappingURL=Prose.js.map