/** The save strategy. `direct` requires the first-party `contribute:direct`
 *  capability and a scarier consent line — a `contribute:any` app asking for it
 *  is REJECTED (`forbidden`), never silently downgraded to a PR (threat T11). */
type ContributeMode = 'pr' | 'direct';
/** A stage emitted as the contribution runs. Mirrors the host orchestrator's
 *  event union; carries progress metadata only — never the token or file blobs. */
type ContributionEvent = {
    stage: 'auth-check';
} | {
    stage: 'diff-compute';
} | {
    stage: 'permission-check';
} | {
    stage: 'install-required';
    targetOwner: string;
    targetRepo: string;
    installUrl: string;
} | {
    stage: 'conflict-check';
} | {
    stage: 'fork-prepare';
    forkOwner: string;
    alreadyExists: boolean;
} | {
    stage: 'upload-blob';
    path: string;
    index: number;
    total: number;
} | {
    stage: 'create-tree';
} | {
    stage: 'create-commit';
} | {
    stage: 'create-branch';
    branchName: string;
} | {
    stage: 'create-pr';
} | {
    stage: 'pr-updated';
    prNumber: number;
    prUrl: string;
    commitSha: string;
} | {
    stage: 'commit-pushed';
    ref: string;
    commitSha: string;
} | {
    stage: 'switch-branch';
    provider: 'github';
    pushOwner: string;
    repository: string;
    branchName: string;
} | {
    stage: 'done';
    prUrl?: string;
    prNumber?: number;
    commitSha: string;
} | {
    stage: 'warning';
    message: string;
    details?: unknown;
} | {
    stage: 'error';
    message: string;
    recoverable: boolean;
};
/** The settled outcome (the stream's return value). */
interface ContributionResult {
    prUrl?: string;
    prNumber?: number;
    commitSha: string;
    treeSha: string;
    branchName: string;
    mode: 'direct-commit' | 'new-branch-pr' | 'extend-existing';
}
interface ContributeOptions {
    /** The commit message / PR title. */
    commitMessage: string;
    /** `'pr'` (default) opens a PR; `'direct'` commits to the branch and needs
     *  the first-party `contribute:direct` capability. */
    mode?: ContributeMode;
    /** Override the generated branch name (PR mode). */
    branchName?: string;
}
/**
 * Save the current working tree, streaming each stage.
 *
 * ```ts
 * for await (const ev of contribute({ commitMessage: 'Edit post' })) {
 *   if (ev.stage === 'done') console.log(ev.prUrl);
 * }
 * ```
 *
 * Yields {@link ContributionEvent}s and returns a {@link ContributionResult}.
 * Throws a `StreamError` (`.code`) if the host rejects the request — notably
 * `forbidden` when a `contribute:any` app asks for `mode: 'direct'` (T11).
 */
declare function contribute(opts: ContributeOptions): AsyncGenerator<ContributionEvent, ContributionResult, void>;

export { type ContributeMode, type ContributeOptions, type ContributionEvent, type ContributionResult, contribute };
