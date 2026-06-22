/** One build/transpile error from the sandbox bundler's compile of the previewed
 *  app. `path` is repo-relative (leading slash) when the error is file-located. */
interface BuildError {
    message: string;
    path?: string;
    line?: number;
    column?: number;
}
type ConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';
/** One captured `console.*` entry from the previewed app. The host renders the
 *  console arguments to text host-side — the agent never receives live object
 *  handles across the boundary. */
interface ConsoleEntry {
    level: ConsoleLevel;
    text: string;
    /** Host-side timestamp (ms) at capture. */
    at: number;
}
/** Provenance (D4 / EDITOR_AS_APP_SPEC §12.3): WHICH previewed app + compile this
 *  snapshot describes, so a consumer can tell stale output from fresh and never
 *  conflates two apps' diagnostics. `null` until a first compile is observed. */
interface DiagnosticsProvenance {
    /** The previewed app's stable key (`provider/ns/repo`). */
    appKey?: string;
    /** Monotonic id of the compile that produced these build errors. */
    compileId?: string;
}
interface Diagnostics {
    buildErrors: BuildError[];
    consoleEntries: ConsoleEntry[];
    provenance: DiagnosticsProvenance | null;
}
/** One-off read of the previewed app's current diagnostics. Returns the empty
 *  snapshot until the host answers (or if the app lacks `diagnostics:read`). Use
 *  {@link onDiagnosticsChange}/{@link useDiagnostics} to react to live updates. */
declare const getDiagnostics: () => Diagnostics;
/** Subscribe to diagnostics. Invoked immediately with the current value, then on
 *  every host push. Returns an unsubscribe. */
declare const onDiagnosticsChange: (listener: (d: Diagnostics) => void) => (() => void);
/** React hook: the current diagnostics, re-rendering on every change. */
declare const useDiagnostics: () => Diagnostics;

export { type BuildError, type ConsoleEntry, type ConsoleLevel, type Diagnostics, type DiagnosticsProvenance, getDiagnostics, onDiagnosticsChange, useDiagnostics };
