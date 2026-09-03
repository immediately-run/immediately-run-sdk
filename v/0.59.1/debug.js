import "./chunk-VHAA22YE.js";
import { createPushChannel } from "./pushChannel";
import { sendMessage, addListener } from "./sandboxUtils";
import { DEBUG_ENABLED, DEBUG_LOG, DEBUG_QUERY, DEBUG_QUERY_RESULT, REQUEST_DEBUG_ENABLED } from "./generated/protocol";
const enabledChannel = createPushChannel({
  pushType: DEBUG_ENABLED,
  requestType: REQUEST_DEBUG_ENABLED,
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
    sendMessage(DEBUG_LOG, { level, message: String(message), data: safeData(data) });
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
  for (const p of params.props.slice(0, 50))
    out[p] = cs.getPropertyValue(p) || cs[p]?.toString?.() || "";
  return out;
}
function rects(params) {
  if (typeof document === "undefined") return [];
  return [...document.querySelectorAll(params.selector)].slice(0, 200).map((el) => {
    const r = el.getBoundingClientRect();
    return { x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height) };
  });
}
const POINTER_TYPES = /* @__PURE__ */ new Set(["pointerdown", "pointerup", "pointermove", "click", "dblclick"]);
const KEY_TYPES = /* @__PURE__ */ new Set(["keydown", "keyup", "keypress"]);
const clampCoord = (v, max) => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
  return Math.max(0, Math.min(Math.round(n), Math.max(0, Math.round(max))));
};
const flag = (v) => v === true;
const PRIMARY = 1;
const heldButtons = (type, params) => {
  if (type === "pointerdown") return PRIMARY;
  if (type !== "pointermove") return 0;
  return params.buttons === PRIMARY || flag(params.drag) ? PRIMARY : 0;
};
function dispatchPointer(params) {
  if (typeof document === "undefined" || typeof window === "undefined") {
    throw new Error("no document in this realm");
  }
  const type = typeof params.type === "string" && POINTER_TYPES.has(params.type) ? params.type : "click";
  const x = clampCoord(params.x, window.innerWidth);
  const y = clampCoord(params.y, window.innerHeight);
  const target = document.elementFromPoint(x, y) ?? document.body;
  if (!target) throw new Error("nothing at that point");
  const init = {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: x,
    clientY: y,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
    // `button` names the button whose state CHANGED. A move changes nothing, so it is
    // -1 there (UI Events §5.2.3) — otherwise a `e.button === 0` check reads a hover
    // as a primary click.
    button: type === "pointermove" ? -1 : 0,
    buttons: heldButtons(type, params),
    ctrlKey: flag(params.ctrlKey),
    shiftKey: flag(params.shiftKey),
    altKey: flag(params.altKey),
    metaKey: flag(params.metaKey)
  };
  const usePointer = type !== "click" && type !== "dblclick" && typeof PointerEvent === "function";
  target.dispatchEvent(usePointer ? new PointerEvent(type, init) : new MouseEvent(type, init));
  const desc = target instanceof Element ? target.tagName.toLowerCase() : "unknown";
  return { type, x, y, target: desc };
}
const LEGACY_KEY_CODES = {
  Backspace: 8,
  Tab: 9,
  Enter: 13,
  Shift: 16,
  Control: 17,
  Alt: 18,
  Pause: 19,
  CapsLock: 20,
  Escape: 27,
  " ": 32,
  PageUp: 33,
  PageDown: 34,
  End: 35,
  Home: 36,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
  Insert: 45,
  Delete: 46,
  Meta: 91,
  ContextMenu: 93
};
const legacyKeyCode = (key, code) => {
  const named = LEGACY_KEY_CODES[key];
  if (named !== void 0) return named;
  const fn = /^F([1-9]|1\d|2[0-4])$/.exec(key);
  if (fn) return 111 + Number(fn[1]);
  if (key.length === 1) return key.toUpperCase().charCodeAt(0);
  const fromCode = /^(?:Key([A-Z])|Digit([0-9]))$/.exec(code);
  if (fromCode) return (fromCode[1] ?? fromCode[2]).charCodeAt(0);
  return 0;
};
function dispatchKey(params) {
  if (typeof document === "undefined") throw new Error("no document in this realm");
  const type = typeof params.type === "string" && KEY_TYPES.has(params.type) ? params.type : "keydown";
  const key = typeof params.key === "string" ? params.key.slice(0, 32) : "";
  if (!key) throw new Error("a key name is required");
  const code = typeof params.code === "string" ? params.code.slice(0, 32) : key;
  const target = document.activeElement ?? document.body;
  const legacy = legacyKeyCode(key, code);
  target.dispatchEvent(
    new KeyboardEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      key,
      code,
      // Deprecated, and load-bearing: `switch (e.keyCode)` is still how most canvas
      // games read input. Kept consistent with `key`/`code` above.
      keyCode: legacy,
      which: legacy,
      ctrlKey: flag(params.ctrlKey),
      shiftKey: flag(params.shiftKey),
      altKey: flag(params.altKey),
      metaKey: flag(params.metaKey),
      repeat: flag(params.repeat)
    })
  );
  const el = document.activeElement;
  return { type, key, target: el ? el.tagName.toLowerCase() : "body" };
}
let responderStarted = false;
function startResponder() {
  if (responderStarted || typeof window === "undefined") return;
  responderStarted = true;
  addListener(DEBUG_QUERY, (msg) => {
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
        case "dispatchPointer":
          result = dispatchPointer(params);
          break;
        case "dispatchKey":
          result = dispatchKey(params);
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
      sendMessage(DEBUG_QUERY_RESULT, { id, ok, result, error });
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