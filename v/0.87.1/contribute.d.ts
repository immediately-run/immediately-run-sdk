/** The save strategy. `direct` requires the first-party `contribute:direct`
 *  capability and a scarier consent line — a `contribute:any` app asking for it
 *  is REJECTED (`forbidden`), never silently downgraded to a PR (threat T11). */
type ContributeMode = 'pr' | 'direct';
/** The recovery a recoverable save error offers (CONTRIBUTE_SPEC §12), so an app
 *  renders the specified action instead of a generic "try again". Mirrors the
 *  host orchestrator's `RecoveryAction`.
 *  - `retry` — the failed step is idempotent; re-running the save is safe.
 *  - `use-different-name` — a branch with that name exists and is not this
 *    session's lineage; renaming (or, for a caller-supplied name, the §8.8 gated
 *    force-update) is the only way on.
 *  - `open-pr` — the branch was pushed but opening the PR failed; resume with the
 *    event's `openPR` context (CT-6), never re-push.
 *  - `switch-to-pr` — a direct commit was rejected as a non-fast-forward; offer a
 *    new branch + PR instead (CT-3). */
type RecoveryAction = 'retry' | 'use-different-name' | 'open-pr' | 'switch-to-pr';
/** Identifiers for the `open-pr` resume: the branch already exists on the push
 *  repo (the upstream or the user's fork) and only the PR is missing. `head` is
 *  the PR head ref (`branch` or `forkOwner:branch`). Minted by the host; an app
 *  passes it back unchanged in {@link ContributeOptions.resume}. */
interface OpenPRResumeContext {
    pushOwner: string;
    repository: string;
    branchName: string;
    base: string;
    head: string;
}
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
    /** The specific recovery to offer. Absent ⇒ the generic recoverable surface. */
    recovery?: RecoveryAction;
    /** Present only with `recovery === 'open-pr'`: the existing branch to open a PR for. */
    openPR?: OpenPRResumeContext;
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
/** Options for a contribution: the commit message, save {@link ContributeMode},
 *  (PR mode) an optional branch name, and the transcript request hint. */
interface ContributeOptions {
    /** The commit message / PR title. */
    commitMessage: string;
    /** `'pr'` (default) opens a PR; `'direct'` commits to the branch and needs
     *  the first-party `contribute:direct` capability. */
    mode?: ContributeMode;
    /** Override the generated branch name (PR mode). */
    branchName?: string;
    /** CONTRIBUTE_TRANSCRIPT_SPEC §4 R-CT-5: the "Commit session transcript"
     *  checkbox's sole effect — a boolean request HINT, never bytes/path/render
     *  (R-CT-6). The host's disclosure review remains the consent (R-CT-7) and
     *  the hint is spent per contribution (R-CT-8). */
    transcriptRequested?: boolean;
    /** CONTRIBUTE_SPEC §8.8: update a caller-supplied branch that already exists.
     *  Offer it only after a `use-different-name` error on a name the user typed;
     *  the host's lineage gate (CT-4) still decides whether the update is allowed. */
    forceUpdateBranch?: boolean;
    /** Resume instead of a fresh save. `open-pr` opens the PR for the branch a
     *  failed attempt already pushed (CT-6), using the error event's `openPR`
     *  context unchanged; the host refuses a context it did not mint for this app. */
    resume?: {
        kind: 'open-pr';
        context: OpenPRResumeContext;
    };
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

export { type ContributeMode, type ContributeOptions, type ContributionEvent, type ContributionResult, type OpenPRResumeContext, type RecoveryAction, contribute };
