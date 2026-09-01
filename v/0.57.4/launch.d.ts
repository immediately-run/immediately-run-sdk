/** Where a launched program runs (§6). `overlay` covers the caller's own region
 *  with opaque host chrome; `stage` replaces the focal app (the elevated into-
 *  stage surface, §7 — refused above the stage-principal ceiling). */
type LaunchRegion = 'overlay' | 'stage';
/**
 * What to launch (§3) — binding-resolved, NEVER a caller-named app. Exactly one of:
 *  - `entryPoint`: a sibling entry point of the caller's OWN repo (the mini-app
 *    case, `AGENT_AUTHORING §5`) — **rejected `forbidden` until program-identity
 *    `appKey` lands** (R-SAL-2a);
 *  - `task`: a task contract (`open-project`, …), resolved through the user-
 *    overridable `task.<name>` binding to whichever app the user bound (§3 kind 2).
 */
interface LaunchTarget {
    /** Kind 1 — a sibling entry point of the caller's own repo (mini-app overlay). */
    entryPoint?: string;
    /** Kind 2 — a task contract name (the host resolves the bound provider). */
    task?: string;
    /** Optional accepted contract version for a `task` target (semver, e.g. `^1`). */
    version?: string;
}
interface LaunchOptions {
    /** Where it runs (§6). */
    region: LaunchRegion;
    /**
     * Delegations + plain data handed to the launched app. `$cap:'dir'|'file'`
     * markers (`capDir`/`capFile`, exported from `./tasks`) are resolved against the
     * launcher's OWN grants and minted as attenuated, `ro`-by-default chroots (§5) —
     * you can only delegate what you already hold. Everything else is plain data.
     */
    input?: Record<string, unknown>;
}
/** The live state of a launch (§2). Terminal states (`dismissed`/`revoked`/
 *  `failed`) are reached identically for self-exit, user dismiss, and host revoke —
 *  the host debounces so the launcher gets no timing oracle (R-SAL-1 / §6.4). */
type LaunchStatus = 'running' | 'dismissed' | 'revoked' | 'failed';
/** Machine codes a refused `launch` resolves with (§8). */
type LaunchErrorCode = 'forbidden' | 'unsupported' | 'budget' | 'revoked' | 'cancelled' | 'invalid-params' | 'unknown';
/**
 * The control channel back to a launch — the ONLY thing a launcher gets (§2).
 * There is no typed return value (R-SAL-1); `status`/`onDismiss` are debounced so
 * they cannot time-distinguish a self-exit from a user dismiss.
 */
interface LaunchHandle {
    /** Host-assigned id for this launch. */
    readonly launchId: string;
    /** The current lifecycle state (§2). */
    readonly status: LaunchStatus;
    /** Ask the host to tear this launch down. Idempotent (double-dismiss is a no-op). */
    dismiss(): void;
    /**
     * Observe the launch ending (self-exit / user dismiss / host revoke — fired
     * identically, R-SAL-1). Returns an unsubscribe fn. Fires at most once; if the
     * launch has already ended it fires on the next tick.
     */
    onDismiss(cb: () => void): () => void;
}
/**
 * Launch a bound program to RUN in a region (§2). Non-blocking: resolves once the
 * frame is created and bound, with a {@link LaunchHandle} — or a typed
 * `{ ok:false, code }` on refusal (§8), NEVER a throw for an ordinary refusal (so
 * a launcher branches on `code` without a try/catch). The launched app runs under
 * its OWN grants; the launcher's authority does not flow to it (R-SAL-4).
 *
 *   const h = await launch({ task: 'open-project' }, {
 *     region: 'stage',
 *     input: { dir: capDir({ mountId: 'space:abc', relPath: 'proj' }, { mode: 'ro' }) },
 *   });
 *   if ('ok' in h && h.ok === false) { ...handle h.code... }
 *   else { h.onDismiss(() => ...); }
 *
 * Off-host (plain `vite dev` — no host transport) it rejects with a plain
 * "no host transport" error: there is no host to run a launch in.
 */
declare const launch: (target: LaunchTarget, opts: LaunchOptions) => Promise<LaunchHandle | {
    ok: false;
    code: LaunchErrorCode;
}>;

export { type LaunchErrorCode, type LaunchHandle, type LaunchOptions, type LaunchRegion, type LaunchStatus, type LaunchTarget, launch };
