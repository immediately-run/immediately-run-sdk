// System-app devtools — the app-facing surface (plan: docs/plans/system-app-devtools.md).
//
// Two opt-in, DEV-ONLY instruments for debugging a sandboxed UI-as-app region:
//   1. `debug.log(...)` — an app→host one-way log surfaced in the host dev panel
//      / CLI `/debug` stream (instead of hand-fishing console output out of a
//      cross-origin iframe's devtools).
//   2. a DOM/layout responder the host can query from outside — the thing a
//      cross-origin screenshot can't reliably give you (a blank capture is
//      ambiguous between a real 0-height collapse and a paint artifact) — which
//      since R3-423 also carries two BOUNDED INPUT verbs, for the canvas/SVG apps
//      that have no accessibility node to drive from outside at all.
//
// SECURITY (the gating constraint — see the plan's §0):
//   - Both are inert unless the HOST signals dev mode via the `debug-enabled`
//     channel. The host only sets it for a dev/override session (the `ir-dev-*`
//     deep link) or an explicit operator developer-mode. A published app served
//     to a normal user gets `enabled:false` → `debug.log` is a no-op and the
//     responder never answers. Production isolation is therefore unchanged.
//   - The responder's vocabulary is CLOSED and fixed in this file: three READ
//     verbs (snapshotDom / computedStyle / rect) and two bounded ACTION verbs
//     (dispatchPointer / dispatchKey, §3 below). It is therefore no longer
//     read-only, and saying so here is the point — the posture documented is the
//     one that ships. There is still deliberately NO eval bridge: that would turn
//     a debug aid into remote code execution into the sandbox, and an unrecognised
//     method is refused rather than interpreted.
//   - What bounds an ACTION verb: ONE synthetic event per query; `type` drawn from
//     a 5-name pointer set or a 3-name key set; coordinates clamped to the
//     viewport; key/code names truncated to 32 chars; button state limited to
//     "none" or "primary held"; modifiers coerced to booleans. No caller-supplied
//     property bag ever reaches an event constructor, and a synthetic event is
//     `isTrusted:false` in every browser, so it can never satisfy a user-activation
//     gate (no popup, clipboard write, fullscreen, passkey prompt or download).
//   - The responder reads only its OWN `document` (it lives in its own opaque
//     iframe and cannot reach a sibling app), so there is no app↔app leak even
//     in dev.
//   - Output is bounded (node/depth/text caps) so a query can't exfiltrate an
//     unbounded payload or wedge the app.
//
// DEV-ONLY, read verbs and action verbs alike: the gate above is re-checked on
// every query, so in a production session this module answers nothing and sends
// nothing. Apps that want their own call sites GONE from the shipped bytes (rather
// than merely inert) guard them behind `import.meta.env.DEV`, which lets the
// bundler drop them from a production build; the runtime gate is the backstop that
// holds regardless of how the app was built.

import { createPushChannel } from './pushChannel';
import { sendMessage, addListener } from './sandboxUtils';
import { DEBUG_ENABLED, DEBUG_LOG, DEBUG_QUERY, DEBUG_QUERY_RESULT, REQUEST_DEBUG_ENABLED } from './generated/protocol';

/** Severity of a {@link debug.log} entry. */
export type DebugLevel = 'debug' | 'info' | 'warn' | 'error';

// ── Dev gate ────────────────────────────────────────────────────────────────
// The host pushes `debug-enabled:true` only for a dev/override session. Until
// then (and always in production) it stays false and every instrument is inert.
const enabledChannel = createPushChannel<boolean>({
  pushType: DEBUG_ENABLED,
  requestType: REQUEST_DEBUG_ENABLED,
  initial: false,
  parse: (msg) => (typeof msg.enabled === 'boolean' ? msg.enabled : undefined),
});

/** Is the host dev-debug surface active for this session? `false` in production. */
export const isDebugEnabled = (): boolean => enabledChannel.get();

/** React hook: whether the host dev-debug surface is active (re-renders on change).
 *  Handy for showing a debug affordance only when it would do something. */
export const useDebugEnabled = (): boolean => enabledChannel.use();

// ── 1. App→host debug log ─────────────────────────────────────────────────────
// Best-effort: a value that can't be structured-cloned is replaced with a marker
// rather than throwing — `debug.log` must never break the app.
const MAX_DATA_BYTES = 16 * 1024;

function safeData(data: unknown): unknown {
  if (data === undefined) return undefined;
  try {
    const json = JSON.stringify(data);
    if (json === undefined) return '[unserializable]';
    if (json.length > MAX_DATA_BYTES) return `[truncated ${json.length}B]`;
    return JSON.parse(json);
  } catch {
    return '[unserializable]';
  }
}

/**
 * Emit a structured debug entry to the host dev surface. A NO-OP unless the host
 * has enabled the dev-debug session ({@link isDebugEnabled}); in production it
 * does nothing and sends nothing.
 *
 *   debug.log('info', 'mounted', { activeFile });
 */
export function log(level: DebugLevel, message: string, data?: unknown): void {
  if (!enabledChannel.get()) return; // inert in prod / non-dev sessions
  try {
    sendMessage(DEBUG_LOG, { level, message: String(message), data: safeData(data) });
  } catch {
    /* transport not ready — drop silently; logging must never throw */
  }
}

// ── 2. Read DOM / layout verbs ────────────────────────────────────────────────
// The host sends `debug-query` { id, method, params }; we reply with
// `debug-query-result` { id, ok, result | error }. Only ever active while the dev
// gate is enabled. The vocabulary is fixed: these three verbs READ, and the two in
// §3 act — nothing in it interprets caller-supplied code.

interface DomNode {
  tag: string;
  id?: string;
  classes?: string[];
  attrs?: Record<string, string>;
  rect?: { x: number; y: number; w: number; h: number };
  text?: string;
  children?: DomNode[];
  truncated?: true;
}

const ATTR_ALLOW = new Set(['role', 'aria-hidden', 'data-theme', 'data-active', 'href', 'type', 'hidden']);
const MAX_NODES = 2000;
const MAX_DEPTH = 25;
const MAX_TEXT = 200;

function round(n: number): number {
  return Math.round(n);
}

function snapshotDom(params: { selector?: string; maxDepth?: number; maxNodes?: number }): DomNode | null {
  if (typeof document === 'undefined') return null;
  const root = params.selector ? document.querySelector(params.selector) : document.body;
  if (!root) return null;
  const maxDepth = Math.min(params.maxDepth ?? MAX_DEPTH, MAX_DEPTH);
  const maxNodes = Math.min(params.maxNodes ?? MAX_NODES, MAX_NODES);
  let budget = maxNodes;

  const walk = (el: Element, depth: number): DomNode => {
    budget--;
    const r = el.getBoundingClientRect();
    const classes = el.classList.length ? [...el.classList] : undefined;
    const attrs: Record<string, string> = {};
    for (const name of el.getAttributeNames()) {
      if (ATTR_ALLOW.has(name)) attrs[name] = el.getAttribute(name) ?? '';
    }
    // Direct text (not descendants') so a leaf's label is visible without dumping
    // the whole subtree's text.
    const ownText = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => (n.textContent ?? '').trim())
      .join(' ')
      .trim();
    const node: DomNode = {
      tag: el.tagName.toLowerCase(),
      ...(el.id ? { id: el.id } : {}),
      ...(classes ? { classes } : {}),
      ...(Object.keys(attrs).length ? { attrs } : {}),
      rect: { x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height) },
      ...(ownText ? { text: ownText.slice(0, MAX_TEXT) } : {}),
    };
    if (depth < maxDepth && el.children.length && budget > 0) {
      const children: DomNode[] = [];
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

function computedStyle(params: { selector: string; props: string[] }): Record<string, string> | null {
  if (typeof document === 'undefined') return null;
  const el = document.querySelector(params.selector);
  if (!el) return null;
  const cs = getComputedStyle(el);
  const out: Record<string, string> = {};
  for (const p of params.props.slice(0, 50))
    out[p] = cs.getPropertyValue(p) || cs[p as keyof CSSStyleDeclaration]?.toString?.() || '';
  return out;
}

function rects(params: { selector: string }): Array<{ x: number; y: number; w: number; h: number }> {
  if (typeof document === 'undefined') return [];
  return [...document.querySelectorAll(params.selector)].slice(0, 200).map((el) => {
    const r = el.getBoundingClientRect();
    return { x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height) };
  });
}

// ── 3. Bounded input injection (roadmap R3-423) ───────────────────────────────
//
// WHY. A canvas app (arcade) or an SVG app (a hex map) cannot be driven from outside
// at all: the frame is opaque-origin, so `evaluate_script` cannot reach it, and there
// is no accessibility node to click — the interactive surface is pixels. The drill
// either cannot run or degenerates into screenshot-eyeballing.
//
// WHY THIS IS NOT AN EVAL BRIDGE. The caller supplies COORDINATES and a key NAME from
// closed vocabularies, never code and never a selector-driven callback. Everything
// this can do, a human with a mouse could already do to the same frame; nothing here
// reads state back beyond the read vocabulary that already exists.
//
// WHY IT IS SAFE EVEN SO:
//   - Same dev gate as the read verbs — inert unless the host pushed
//     `debug-enabled:true`, which it only does for a dev/override session.
//   - A synthetic event is `isTrusted: false` in every browser, so it can never
//     satisfy a USER-ACTIVATION gate: no popup, no clipboard write, no fullscreen,
//     no passkey prompt, no download. This is the property that keeps a bounded
//     injector from being an escalation, and it is a browser invariant rather than
//     something this module enforces.
//   - The event TYPE comes from a closed set, coordinates are finite and clamped to
//     the viewport, the button state is "none" or "primary held" and nothing else,
//     and modifiers are booleans. No arbitrary property bag reaches the constructor,
//     so a caller cannot forge `isTrusted` or smuggle a handler.
//   - It targets whatever is at the point in this frame's OWN document; the frame
//     cannot reach a sibling app, exactly as for the read verbs.

const POINTER_TYPES = new Set(['pointerdown', 'pointerup', 'pointermove', 'click', 'dblclick']);
const KEY_TYPES = new Set(['keydown', 'keyup', 'keypress']);

const clampCoord = (v: unknown, max: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  return Math.max(0, Math.min(Math.round(n), Math.max(0, Math.round(max))));
};

const flag = (v: unknown): boolean => v === true;

/** The only button mask this verb will synthesise: the primary button. */
const PRIMARY = 1;

/**
 * The `buttons` bitmask (which buttons are HELD, not which one changed) for an
 * injected pointer event.
 *
 * This used to be `1` for everything except an up/click, which made EVERY injected
 * move read as a drag: a hover test was impossible to write, and a canvas app's
 * `if (e.buttons)` branch fired on a plain move — exactly the apps the verb targets.
 * So the caller says which it wants, inside the same closed bound as `type`: a move
 * carries NO buttons unless the caller asks for `buttons: 1` (or `drag: true`), and
 * nothing else is accepted. A press is held-by-definition and a release is
 * released-by-definition, so those two do not read the caller's ask at all.
 */
const heldButtons = (type: string, params: Record<string, unknown>): number => {
  if (type === 'pointerdown') return PRIMARY; // a press: the button is down by definition
  if (type !== 'pointermove') return 0; // pointerup / click / dblclick: already released
  return params.buttons === PRIMARY || flag(params.drag) ? PRIMARY : 0;
};

/** Dispatch one bounded pointer event at a viewport coordinate inside THIS frame.
 *  Returns what it hit, so a drill can assert it aimed at the right thing rather
 *  than clicking into the void and reading a screenshot to find out.
 *
 *  `params`: `{ type, x, y, buttons?: 0 | 1, drag?: boolean, ctrl/shift/alt/metaKey? }`.
 *  A `pointermove` is a HOVER by default; pass `buttons: 1` (or `drag: true`) for the
 *  move-with-primary-held that a drag is made of. */
function dispatchPointer(params: Record<string, unknown>): { type: string; x: number; y: number; target: string } {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    throw new Error('no document in this realm');
  }
  const type = typeof params.type === 'string' && POINTER_TYPES.has(params.type) ? params.type : 'click';
  const x = clampCoord(params.x, window.innerWidth);
  const y = clampCoord(params.y, window.innerHeight);
  const target = document.elementFromPoint(x, y) ?? document.body;
  if (!target) throw new Error('nothing at that point');
  const init: PointerEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: x,
    clientY: y,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    // `button` names the button whose state CHANGED. A move changes nothing, so it is
    // -1 there (UI Events §5.2.3) — otherwise a `e.button === 0` check reads a hover
    // as a primary click.
    button: type === 'pointermove' ? -1 : 0,
    buttons: heldButtons(type, params),
    ctrlKey: flag(params.ctrlKey),
    shiftKey: flag(params.shiftKey),
    altKey: flag(params.altKey),
    metaKey: flag(params.metaKey),
  };
  // `click`/`dblclick` are MouseEvents; the rest are PointerEvents. Constructing the
  // right class matters for a canvas app that reads `pointerId`/`pointerType`.
  // A realm without `PointerEvent` (jsdom, an older engine) falls back to a
  // MouseEvent of the SAME TYPE — which still reaches a `pointerdown` listener, so
  // the verb degrades instead of throwing. The responder must never throw into an
  // app; and a drill that gets a slightly thinner event is strictly better off than
  // one that gets an error.
  const usePointer = type !== 'click' && type !== 'dblclick' && typeof PointerEvent === 'function';
  target.dispatchEvent(usePointer ? new PointerEvent(type, init) : new MouseEvent(type, init));
  const desc = target instanceof Element ? target.tagName.toLowerCase() : 'unknown';
  return { type, x, y, target: desc };
}

// Legacy `keyCode` / `which`. Deprecated in the UI Events spec for a decade and still
// what the arcade/canvas input loops this verb exists for actually read
// (`switch (e.keyCode)`), so an injected key carrying only `key`/`code` is INVISIBLE to
// them. Derived here from the key NAME — a bounded table plus the printable-character
// rule — never taken from the caller, so populating them adds no input surface.
const LEGACY_KEY_CODES: Record<string, number> = {
  Backspace: 8,
  Tab: 9,
  Enter: 13,
  Shift: 16,
  Control: 17,
  Alt: 18,
  Pause: 19,
  CapsLock: 20,
  Escape: 27,
  ' ': 32,
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
  ContextMenu: 93,
};

const legacyKeyCode = (key: string, code: string): number => {
  const named = LEGACY_KEY_CODES[key];
  if (named !== undefined) return named;
  // F1–F24 → 112…135: the one family worth deriving instead of listing.
  const fn = /^F([1-9]|1\d|2[0-4])$/.exec(key);
  if (fn) return 111 + Number(fn[1]);
  // A single printable character reports its UPPERCASE code unit, which is what a
  // physical keyboard sends for the letter/digit rows ('a' and 'A' are both 65).
  if (key.length === 1) return key.toUpperCase().charCodeAt(0);
  // A named `code` covers a key name that is not a single character (an IME/dead key).
  const fromCode = /^(?:Key([A-Z])|Digit([0-9]))$/.exec(code);
  if (fromCode) return (fromCode[1] ?? fromCode[2]).charCodeAt(0);
  return 0; // unknown — 0 is what a browser reports for a key with no legacy code
};

/** Dispatch one bounded keyboard event at the focused element (or the body) —
 *  an arcade app's real input surface. `key` is passed through as a name (e.g.
 *  `ArrowLeft`, `a`, ` `); `code` defaults to it, and the deprecated-but-ubiquitous
 *  `keyCode`/`which` are derived from them so a legacy input loop sees the key. */
function dispatchKey(params: Record<string, unknown>): { type: string; key: string; target: string } {
  if (typeof document === 'undefined') throw new Error('no document in this realm');
  const type = typeof params.type === 'string' && KEY_TYPES.has(params.type) ? params.type : 'keydown';
  const key = typeof params.key === 'string' ? params.key.slice(0, 32) : '';
  if (!key) throw new Error('a key name is required');
  const code = typeof params.code === 'string' ? params.code.slice(0, 32) : key;
  const target: EventTarget = document.activeElement ?? document.body;
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
      repeat: flag(params.repeat),
    }),
  );
  const el = document.activeElement;
  return { type, key, target: el ? el.tagName.toLowerCase() : 'body' };
}

let responderStarted = false;

/** Wire the debug responder: the READ verbs (snapshotDom / computedStyle / rect) and
 *  the two BOUNDED ACTION verbs (dispatchPointer / dispatchKey — one synthetic event
 *  per query, closed type set, clamped coordinates, no caller property bag). Not an
 *  eval bridge: an unrecognised method is refused, never interpreted.
 *
 *  Idempotent; called lazily once the dev gate turns on, and every query re-checks the
 *  gate — so in a production session it answers nothing, action verbs included. No
 *  effect when `window` is absent (non-browser realm). */
function startResponder(): void {
  if (responderStarted || typeof window === 'undefined') return;
  responderStarted = true;
  addListener(DEBUG_QUERY, (msg: { id?: unknown; method?: unknown; params?: unknown }) => {
    if (!enabledChannel.get()) return; // gate: ignore unless dev-enabled
    const id = msg.id;
    const method = msg.method;
    const params = (msg.params ?? {}) as Record<string, unknown>;
    let ok = true;
    let result: unknown = null;
    let error: string | undefined;
    try {
      switch (method) {
        case 'snapshotDom':
          result = snapshotDom(params as never);
          break;
        case 'computedStyle':
          result = computedStyle(params as never);
          break;
        case 'rect':
          result = rects(params as never);
          break;
        case 'dispatchPointer':
          result = dispatchPointer(params);
          break;
        case 'dispatchKey':
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
      /* transport gone — nothing to do */
    }
  });
}

// Start the responder as soon as the gate flips on (and not before).
enabledChannel.onChange((enabled) => {
  if (enabled) startResponder();
});

/** The dev-only debug surface. Inert unless the host enables it ({@link isDebugEnabled}). */
export const debug = { log, isEnabled: isDebugEnabled } as const;
