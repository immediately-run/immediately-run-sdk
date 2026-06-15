// The `diagnostics:read` channel — app-facing surface (LLM_AND_AGENTS_SPEC §3.3/§4,
// D4; roadmap R3-74 / P3-72).
//
// A *sibling* agent app (one holding `diagnostics:read`) observes the result of its
// edits to the PREVIEWED app: the build/transpile errors from the sandbox bundler
// and the previewed app's captured `console.*`. This is the in-browser analogue of
// a local coding agent reading compiler/test output (P3-73's `get_diagnostics()`
// tool). Read-only and scoped host-side to the paired previewed app's OWN
// diagnostics — never another app's (the host channel projection enforces it; the
// previewed app itself holds no `diagnostics:read`, so it is origin-excluded).
//
// Recipe-A push channel, identical get/onChange/use trio as `secrets`/`catalog`:
// the host pushes `diagnostics` on change and answers a `request-diagnostics` poll,
// gated per-frame by the read ACL. Inert until the host wires the channel
// (site-main `channelBridge`); the contract ships here so the agent app (P3-73) can
// be written against it.
import { createPushChannel } from './pushChannel';

/** One build/transpile error from the sandbox bundler's compile of the previewed
 *  app. `path` is repo-relative (leading slash) when the error is file-located. */
export interface BuildError {
  message: string;
  path?: string;
  line?: number;
  column?: number;
}

export type ConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

/** One captured `console.*` entry from the previewed app. The host renders the
 *  console arguments to text host-side — the agent never receives live object
 *  handles across the boundary. */
export interface ConsoleEntry {
  level: ConsoleLevel;
  text: string;
  /** Host-side timestamp (ms) at capture. */
  at: number;
}

/** Provenance (D4 / EDITOR_AS_APP_SPEC §12.3): WHICH previewed app + compile this
 *  snapshot describes, so a consumer can tell stale output from fresh and never
 *  conflates two apps' diagnostics. `null` until a first compile is observed. */
export interface DiagnosticsProvenance {
  /** The previewed app's stable key (`provider/ns/repo`). */
  appKey?: string;
  /** Monotonic id of the compile that produced these build errors. */
  compileId?: string;
}

export interface Diagnostics {
  buildErrors: BuildError[];
  consoleEntries: ConsoleEntry[];
  provenance: DiagnosticsProvenance | null;
}

/** Value before the host answers — also the value when the app may not read the
 *  channel (no `diagnostics:read`): an empty, provenance-less snapshot. */
const EMPTY: Diagnostics = { buildErrors: [], consoleEntries: [], provenance: null };

const channel = createPushChannel<Diagnostics>({
  pushType: 'diagnostics',
  requestType: 'request-diagnostics',
  initial: EMPTY,
  parse: (msg) => {
    // Require both arrays; tolerate an absent/partial provenance. A malformed push
    // is ignored (returns undefined) so the last good snapshot stands.
    if (!Array.isArray(msg.buildErrors) || !Array.isArray(msg.consoleEntries)) return undefined;
    const provenance =
      msg.provenance && typeof msg.provenance === 'object'
        ? (msg.provenance as DiagnosticsProvenance)
        : null;
    return {
      buildErrors: msg.buildErrors as BuildError[],
      consoleEntries: msg.consoleEntries as ConsoleEntry[],
      provenance,
    };
  },
});

/** One-off read of the previewed app's current diagnostics. Returns the empty
 *  snapshot until the host answers (or if the app lacks `diagnostics:read`). Use
 *  {@link onDiagnosticsChange}/{@link useDiagnostics} to react to live updates. */
export const getDiagnostics = (): Diagnostics => channel.get();

/** Subscribe to diagnostics. Invoked immediately with the current value, then on
 *  every host push. Returns an unsubscribe. */
export const onDiagnosticsChange = (listener: (d: Diagnostics) => void): (() => void) =>
  channel.onChange(listener);

/** React hook: the current diagnostics, re-rendering on every change. */
export const useDiagnostics = (): Diagnostics => channel.use();
