import "../chunk-VHAA22YE.js";
import { jsx } from "react/jsx-runtime";
import { useEffect, useRef } from "react";
import { PROVIDER_ICON_IDS, PROVIDER_ICON_SPRITE } from "./sprite.generated.js";
const SPRITE_NODE_ID = "ir-provider-icon-sprite";
const ensureSprite = (doc) => {
  if (doc.getElementById(SPRITE_NODE_ID)) return;
  const host = doc.createElement("div");
  host.id = SPRITE_NODE_ID;
  host.setAttribute("aria-hidden", "true");
  host.style.display = "none";
  host.innerHTML = PROVIDER_ICON_SPRITE;
  doc.body.appendChild(host);
};
function ProviderIcon({ id, label, size = 16 }) {
  const known = PROVIDER_ICON_IDS.includes(id);
  const docRef = useRef(null);
  if (typeof document !== "undefined") docRef.current = document;
  useEffect(() => {
    if (known && docRef.current) ensureSprite(docRef.current);
  }, [known]);
  if (!known) {
    return /* @__PURE__ */ jsx(
      "span",
      {
        role: "img",
        "aria-label": label,
        style: { display: "inline-block", width: size, height: size, textAlign: "center" },
        children: label.charAt(0).toUpperCase()
      }
    );
  }
  return /* @__PURE__ */ jsx("svg", { role: "img", "aria-label": label, width: size, height: size, children: /* @__PURE__ */ jsx("use", { href: `#pi-${id}` }) });
}
export {
  ProviderIcon
};
//# sourceMappingURL=ProviderIcon.js.map