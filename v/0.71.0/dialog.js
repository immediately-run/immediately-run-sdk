import "./chunk-VHAA22YE.js";
import { jsx } from "react/jsx-runtime";
import { useEffect, useRef } from "react";
const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, iframe, [tabindex]:not([tabindex="-1"])';
const stack = [];
const onDocumentKeyDown = (e) => {
  if (e.key !== "Escape") return;
  const top = stack[stack.length - 1];
  if (!top) return;
  e.stopPropagation();
  top.onDismiss();
};
function useDialogDismiss(onDismiss, { enabled = true } = {}) {
  const ref = useRef(onDismiss);
  ref.current = onDismiss;
  useEffect(() => {
    if (!enabled) return;
    const entry = { onDismiss: () => ref.current() };
    stack.push(entry);
    if (stack.length === 1) document.addEventListener("keydown", onDocumentKeyDown, true);
    return () => {
      const i = stack.indexOf(entry);
      if (i !== -1) stack.splice(i, 1);
      if (stack.length === 0) document.removeEventListener("keydown", onDocumentKeyDown, true);
    };
  }, [enabled]);
}
function useDialogFocus(ref, { enabled = true } = {}) {
  useEffect(() => {
    const node = ref.current;
    if (!enabled || !node) return;
    const invoker = document.activeElement;
    const first = node.querySelector(FOCUSABLE) ?? node;
    first.focus();
    const onKeyDown = (e) => {
      if (e.key !== "Tab") return;
      const list = Array.from(node.querySelectorAll(FOCUSABLE));
      if (list.length === 0) return;
      const firstEl = list[0];
      const lastEl = list[list.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    node.addEventListener("keydown", onKeyDown);
    return () => {
      node.removeEventListener("keydown", onKeyDown);
      invoker?.focus?.();
    };
  }, [enabled, ref]);
}
function Dialog({ children, onDismiss, className, style, ...aria }) {
  const ref = useRef(null);
  useDialogDismiss(onDismiss);
  useDialogFocus(ref);
  return /* @__PURE__ */ jsx("div", { ref, role: "dialog", "aria-modal": "true", className, style, ...aria, children });
}
export {
  Dialog,
  useDialogDismiss,
  useDialogFocus
};
//# sourceMappingURL=dialog.js.map