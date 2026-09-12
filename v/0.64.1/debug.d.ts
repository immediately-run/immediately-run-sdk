/** Severity of a {@link debug.log} entry. */
type DebugLevel = 'debug' | 'info' | 'warn' | 'error';
/** Is the host dev-debug surface active for this session? `false` in production. */
declare const isDebugEnabled: () => boolean;
/** React hook: whether the host dev-debug surface is active (re-renders on change).
 *  Handy for showing a debug affordance only when it would do something. */
declare const useDebugEnabled: () => boolean;
/**
 * Emit a structured debug entry to the host dev surface. A NO-OP unless the host
 * has enabled the dev-debug session ({@link isDebugEnabled}); in production it
 * does nothing and sends nothing.
 *
 *   debug.log('info', 'mounted', { activeFile });
 */
declare function log(level: DebugLevel, message: string, data?: unknown): void;
/** The dev-only debug surface. Inert unless the host enables it ({@link isDebugEnabled}). */
declare const debug: {
    readonly log: typeof log;
    readonly isEnabled: () => boolean;
};

export { type DebugLevel, debug, isDebugEnabled, log, useDebugEnabled };
