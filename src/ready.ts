// The `ir.interactive` boot signal — the app-facing `reportReady()` / `onReady()` /
// `getReadyState()` surface (LOAD_PROFILING_SPEC §3.1, R3-46). This closes the
// "existing SDK boot signal" that `UI_AS_APPS_SPEC §6.2` referenced but never
// defined.
//
// The runtime marks `ir.interactive` when the app's root render commits. An app
// whose USEFULLY-interactive moment is later than first commit (e.g. after an
// initial data load) calls `reportReady()` to DELAY the signal — which, per LP2-3,
// can only ever push interactive later, never earlier than the commit (the host
// resolves `max(commit, reportReady)`; see `resolveInteractive`). `onReady` /
// `getReadyState` expose the report state in the same poll+subscribe shape as
// `auth` / `mounts`.

import { sendMessage as defaultSend } from "./sandboxUtils";

/** The app's `reportReady()` state, mirrored by {@link onReady}/{@link getReadyState}. */
export interface ReadyState {
  /** Whether the app has called `reportReady()`. */
  reported: boolean;
  /** The app-reported timestamp (`performance.now()`), if it has reported. */
  reportedAt?: number;
}

interface ReadyDeps {
  send: (type: string, data?: Record<string, unknown>) => void;
  now: () => number;
}

const realNow = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

const defaultDeps: ReadyDeps = { send: defaultSend, now: realNow };

let deps: ReadyDeps = defaultDeps;
let state: ReadyState = { reported: false };
const listeners = new Set<(s: ReadyState) => void>();

/**
 * Signal that the app is usefully interactive (e.g. after an initial data load).
 * IDEMPOTENT — only the FIRST call counts; later calls are ignored. Forwards the
 * report to the runtime (`ir-report-ready`) so the host can resolve
 * `ir.interactive = max(rootRenderCommit, reportedAt)` (LP2-3) — calling it before
 * the root render commits can only delay the signal, never advance it.
 *
 * UX contract (LOADING_UX_SPEC §9.1): calling this tells the host *"keep your
 * loading skeleton up; I am not done yet"* — the host holds the §3 reveal until
 * this call (or the load budget). Call it ONCE, when the first USEFULLY-interactive
 * frame is on screen — not at mount, and not after every async settle. An app that
 * never calls it reveals automatically at the root-render commit (the default path).
 */
export function reportReady(): void {
  if (state.reported) return;
  state = { reported: true, reportedAt: deps.now() };
  try {
    deps.send("ir-report-ready", { at: state.reportedAt });
  } catch {
    /* transport not ready — the runtime still marks interactive at root commit */
  }
  for (const l of listeners) l(state);
}

/** Pollable snapshot of the report state. */
export function getReadyState(): ReadyState {
  return state;
}

/**
 * Subscribe to the ready signal. Invoked immediately with the current state (so a
 * late subscriber after `reportReady()` still fires) and again whenever it reports.
 * Returns an unsubscribe.
 */
export function onReady(listener: (s: ReadyState) => void): () => void {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}

/** Test seam: override the transport/clock. */
export function __setReadyDeps(d: Partial<ReadyDeps>): void {
  deps = { ...defaultDeps, ...d };
}

/** Test seam: reset module state between cases. */
export function __resetReady(): void {
  deps = defaultDeps;
  state = { reported: false };
  listeners.clear();
}
