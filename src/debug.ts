// System-app devtools — the app-facing surface (plan: docs/plans/system-app-devtools.md).
//
// Two opt-in, DEV-ONLY instruments for debugging a sandboxed UI-as-app region:
//   1. `debug.log(...)` — an app→host one-way log surfaced in the host dev panel
//      / CLI `/debug` stream (instead of hand-fishing console output out of a
//      cross-origin iframe's devtools).
//   2. a READ-ONLY DOM/layout responder the host can query from outside — the
//      thing a cross-origin screenshot can't reliably give you (a blank capture
//      is ambiguous between a real 0-height collapse and a paint artifact).
//
// SECURITY (the gating constraint — see the plan's §0):
//   - Both are inert unless the HOST signals dev mode via the `debug-enabled`
//     channel. The host only sets it for a dev/override session (the `ir-dev-*`
//     deep link) or an explicit operator developer-mode. A published app served
//     to a normal user gets `enabled:false` → `debug.log` is a no-op and the
//     responder never answers. Production isolation is therefore unchanged.
//   - The responder is READ-ONLY with a fixed vocabulary (snapshotDom /
//     computedStyle / rect). There is deliberately NO eval bridge — that would
//     turn a debug aid into remote code execution into the sandbox.
//   - The responder reads only its OWN `document` (it lives in its own opaque
//     iframe and cannot reach a sibling app), so there is no app↔app leak even
//     in dev.
//   - Output is bounded (node/depth/text caps) so a query can't exfiltrate an
//     unbounded payload or wedge the app.
//
// Apps that want the strongest guarantee can additionally guard their own usage
// behind `import.meta.env.DEV` so the calls are tree-shaken from prod bundles;
// the runtime gate here is the backstop that holds regardless.

import { createPushChannel } from './pushChannel';
import { sendMessage, addListener } from './sandboxUtils';
import { DEBUG_ENABLED, REQUEST_DEBUG_ENABLED } from './generated/protocol';

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
    sendMessage('debug-log', { level, message: String(message), data: safeData(data) });
  } catch {
    /* transport not ready — drop silently; logging must never throw */
  }
}

// ── 2. Read-only DOM / layout responder ───────────────────────────────────────
// The host sends `debug-query` { id, method, params }; we reply with
// `debug-query-result` { id, ok, result | error }. Only ever active while the dev
// gate is enabled. Vocabulary is fixed and read-only.

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
  for (const p of params.props.slice(0, 50)) out[p] = cs.getPropertyValue(p) || cs[p as keyof CSSStyleDeclaration]?.toString?.() || '';
  return out;
}

function rects(params: { selector: string }): Array<{ x: number; y: number; w: number; h: number }> {
  if (typeof document === 'undefined') return [];
  return [...document.querySelectorAll(params.selector)].slice(0, 200).map((el) => {
    const r = el.getBoundingClientRect();
    return { x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height) };
  });
}

let responderStarted = false;

/** Wire the read-only DOM/layout responder. Idempotent; called lazily once the
 *  dev gate turns on. No effect when `document` is absent (non-browser realm). */
function startResponder(): void {
  if (responderStarted || typeof window === 'undefined') return;
  responderStarted = true;
  addListener('debug-query', (msg: { id?: unknown; method?: unknown; params?: unknown }) => {
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
        default:
          ok = false;
          error = `unknown debug method: ${String(method)}`;
      }
    } catch (e) {
      ok = false;
      error = e instanceof Error ? e.message : String(e);
    }
    try {
      sendMessage('debug-query-result', { id, ok, result, error });
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
