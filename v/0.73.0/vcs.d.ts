/** One changed path in the working tree (vs. the loaded ref). `status` mirrors the
 *  host `DiffResult` change kinds; `path` is repo-relative. Contents are NOT
 *  carried — the native panel showed path + status, and a per-file content diff is
 *  a deferred follow-up (plan step 6). */
interface VcsChange {
    path: string;
    status: 'created' | 'modified' | 'deleted';
}
/** The branch the working tree sits on and the upstream it diverged from
 *  (host `BranchInfo`, §15.1). `null` until the user is on a immediately.run-created
 *  branch. `upstreamPushable` is `null` while push access is still being probed. */
interface VcsBranch {
    name: string;
    parentRepo: string;
    parentRef: string;
    parentCommitSha: string;
    upstreamPushable: boolean | null;
}
/** One pull request open from the current branch (host `BranchPR`). */
interface VcsPR {
    number: number;
    url: string;
    title: string;
    state: 'open' | 'closed' | 'merged';
    draft: boolean;
}
/** The whole source-control snapshot the host projects to a `vcs:read` frame.
 *  Plain JSON — never a `DiffResult` / `FileSystem` / `Journal`. */
interface VcsState {
    changes: VcsChange[];
    branch: VcsBranch | null;
    prs: VcsPR[];
    /** True while the host is recomputing the diff — the panel shows a spinner
     *  without a separate request (plan gotcha). */
    diffLoading: boolean;
}
/** One-off read of the current source-control state. Returns the empty snapshot
 *  until the host answers (or if the app lacks `vcs:read`). Use
 *  {@link onVcsStateChange} / {@link useVcsState} to react to live updates. */
declare const getVcsState: () => VcsState;
/** Subscribe to source-control changes. Invoked immediately with the current
 *  value, then on every host push (diff refresh, PR poll, branch change). Returns
 *  an unsubscribe. */
declare const onVcsStateChange: (listener: (state: VcsState) => void) => (() => void);
/** React hook: the current source-control state, re-rendering on every change. */
declare const useVcsState: () => VcsState;
/** An error from a `vcs` action, carrying a machine-readable `.code`. */
interface VcsActionError extends Error {
    code: 'forbidden' | 'invalid-params' | 'no-target' | 'unknown';
}
/** Ask the host to recompute the working-tree diff and push a fresh {@link VcsState}.
 *  Gated `vcs:read`. Rejects with a {@link VcsActionError} (`.code`). */
declare const refreshDiff: () => Promise<void>;
/** Ask the host to re-poll the open PRs and push a fresh {@link VcsState}. Gated
 *  `vcs:read`. Rejects with a {@link VcsActionError} (`.code`). */
declare const refreshPRs: () => Promise<void>;
/** Ask the host to DISCARD the working tree (COW writable wipe + journal clear) —
 *  irreversible. First-party-only (`vcs:reset`); a fork/preview is refused at the
 *  gate. Requires `confirm: true` (host belt-and-braces). Rejects with a
 *  {@link VcsActionError} (`.code`). */
declare const resetWorkingTree: () => Promise<void>;

export { type VcsActionError, type VcsBranch, type VcsChange, type VcsPR, type VcsState, getVcsState, onVcsStateChange, refreshDiff, refreshPRs, resetWorkingTree, useVcsState };
