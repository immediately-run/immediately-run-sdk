import "../chunk-VHAA22YE.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { parseSafeMdast } from "./parseSafeMdast";
import { renderMdast } from "./renderMdast";
function SafeContent({ source, fallback = null, ...options }) {
  const [tree, setTree] = useState(null);
  const runId = useRef(0);
  useEffect(() => {
    const id = ++runId.current;
    setTree(null);
    let cancelled = false;
    parseSafeMdast(source).then((parsed) => {
      if (!cancelled && runId.current === id) setTree(parsed);
    }).catch(() => {
      if (!cancelled && runId.current === id) setTree(null);
    });
    return () => {
      cancelled = true;
    };
  }, [source]);
  const rendered = useMemo(
    () => tree ? renderMdast(tree, options) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tree, options.components, options.resolveWikiLink]
  );
  return tree ? rendered : fallback;
}
export {
  SafeContent
};
//# sourceMappingURL=SafeContent.js.map