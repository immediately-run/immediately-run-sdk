import "./chunk-VHAA22YE.js";
import { createPushChannel } from "./pushChannel";
import { sendMessage, addListener } from "./sandboxUtils";
const enabledChannel = createPushChannel({
  pushType: "debug-enabled",
  requestType: "request-debug-enabled",
  initial: false,
  parse: (msg) => typeof msg.enabled === "boolean" ? msg.enabled : void 0
});
const isDebugEnabled = () => enabledChannel.get();
const useDebugEnabled = () => enabledChannel.use();
const MAX_DATA_BYTES = 16 * 1024;
function safeData(data) {
  if (data === void 0) return void 0;
  try {
    const json = JSON.stringify(data);
    if (json === void 0) return "[unserializable]";
    if (json.length > MAX_DATA_BYTES) return `[truncated ${json.length}B]`;
    return JSON.parse(json);
  } catch {
    return "[unserializable]";
  }
}
function log(level, message, data) {
  if (!enabledChannel.get()) return;
  try {
    sendMessage("debug-log", { level, message: String(message), data: safeData(data) });
  } catch {
  }
}
const ATTR_ALLOW = /* @__PURE__ */ new Set(["role", "aria-hidden", "data-theme", "data-active", "href", "type", "hidden"]);
const MAX_NODES = 2e3;
const MAX_DEPTH = 25;
const MAX_TEXT = 200;
function round(n) {
  return Math.round(n);
}
function snapshotDom(params) {
  if (typeof document === "undefined") return null;
  const root = params.selector ? document.querySelector(params.selector) : document.body;
  if (!root) return null;
  const maxDepth = Math.min(params.maxDepth ?? MAX_DEPTH, MAX_DEPTH);
  const maxNodes = Math.min(params.maxNodes ?? MAX_NODES, MAX_NODES);
  let budget = maxNodes;
  const walk = (el, depth) => {
    budget--;
    const r = el.getBoundingClientRect();
    const classes = el.classList.length ? [...el.classList] : void 0;
    const attrs = {};
    for (const name of el.getAttributeNames()) {
      if (ATTR_ALLOW.has(name)) attrs[name] = el.getAttribute(name) ?? "";
    }
    const ownText = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => (n.textContent ?? "").trim()).join(" ").trim();
    const node = {
      tag: el.tagName.toLowerCase(),
      ...el.id ? { id: el.id } : {},
      ...classes ? { classes } : {},
      ...Object.keys(attrs).length ? { attrs } : {},
      rect: { x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height) },
      ...ownText ? { text: ownText.slice(0, MAX_TEXT) } : {}
    };
    if (depth < maxDepth && el.children.length && budget > 0) {
      const children = [];
      for (const child of el.children) {
        if (budget <= 0) {
          node.truncated = true;
          break;
        }
        children.push(walk(child, depth + 1));
      }
      if (children.length) node.children = children;
    } else if (el.children.length) {
      node.truncated = true;
    }
    return node;
  };
  return walk(root, 0);
}
function computedStyle(params) {
  if (typeof document === "undefined") return null;
  const el = document.querySelector(params.selector);
  if (!el) return null;
  const cs = getComputedStyle(el);
  const out = {};
  for (const p of params.props.slice(0, 50)) out[p] = cs.getPropertyValue(p) || cs[p]?.toString?.() || "";
  return out;
}
function rects(params) {
  if (typeof document === "undefined") return [];
  return [...document.querySelectorAll(params.selector)].slice(0, 200).map((el) => {
    const r = el.getBoundingClientRect();
    return { x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height) };
  });
}
let responderStarted = false;
function startResponder() {
  if (responderStarted || typeof window === "undefined") return;
  responderStarted = true;
  addListener("debug-query", (msg) => {
    if (!enabledChannel.get()) return;
    const id = msg.id;
    const method = msg.method;
    const params = msg.params ?? {};
    let ok = true;
    let result = null;
    let error;
    try {
      switch (method) {
        case "snapshotDom":
          result = snapshotDom(params);
          break;
        case "computedStyle":
          result = computedStyle(params);
          break;
        case "rect":
          result = rects(params);
          break;
        default:
          ok = false;
          error = `unknown debug method: ${String(method)}`;
      }
    } catch (e) {
      ok = false;
      error = e instanceof Error ? e.message : String(e);
    }
    try {
      sendMessage("debug-query-result", { id, ok, result, error });
    } catch {
    }
  });
}
enabledChannel.onChange((enabled) => {
  if (enabled) startResponder();
});
const debug = { log, isEnabled: isDebugEnabled };
export {
  debug,
  isDebugEnabled,
  log,
  useDebugEnabled
};
//# sourceMappingURL=debug.js.map