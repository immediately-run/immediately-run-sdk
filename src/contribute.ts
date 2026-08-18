// Contribute — stream a save (PR or direct commit) from app code
// (UI_AS_APPS_SPEC §5.1, CONTRIBUTE_SPEC). The host runs the *existing*
// contribution orchestrator and streams its stages back; this is the typed
// front door over `protocolStream`.
//
// The OAuth token never reaches here — it stays on the host. The app passes a
// commit message + save mode and watches stages go by; the host owns the token,
// the GitHub API calls, and the user-facing consent.
import { protocolStream } from './protocolStream';
import { PROTOCOL_CONTRIBUTE } from './generated/protocol';

/** The save strategy. `direct` requires the first-party `contribute:direct`
 *  capability and a scarier consent line — a `contribute:any` app asking for it
 *  is REJECTED (`forbidden`), never silently downgraded to a PR (threat T11). */
export type ContributeMode = 'pr' | 'direct';

/** A stage emitted as the contribution runs. Mirrors the host orchestrator's
 *  event union; carries progress metadata only — never the token or file blobs. */
export type ContributionEvent =
  | { stage: 'auth-check' }
  | { stage: 'diff-compute' }
  | { stage: 'permission-check' }
  | { stage: 'install-required'; targetOwner: string; targetRepo: string; installUrl: string }
  | { stage: 'conflict-check' }
  | { stage: 'fork-prepare'; forkOwner: string; alreadyExists: boolean }
  | { stage: 'upload-blob'; path: string; index: number; total: number }
  | { stage: 'create-tree' }
  | { stage: 'create-commit' }
  | { stage: 'create-branch'; branchName: string }
  | { stage: 'create-pr' }
  | { stage: 'pr-updated'; prNumber: number; prUrl: string; commitSha: string }
  | { stage: 'commit-pushed'; ref: string; commitSha: string }
  | { stage: 'switch-branch'; provider: 'github'; pushOwner: string; repository: string; branchName: string }
  | { stage: 'done'; prUrl?: string; prNumber?: number; commitSha: string }
  | { stage: 'warning'; message: string; details?: unknown }
  | { stage: 'error'; message: string; recoverable: boolean };

/** The settled outcome (the stream's return value). */
export interface ContributionResult {
  prUrl?: string;
  prNumber?: number;
  commitSha: string;
  treeSha: string;
  branchName: string;
  mode: 'direct-commit' | 'new-branch-pr' | 'extend-existing';
}

/** Options for a contribution: the commit message, save {@link ContributeMode},
 *  and (PR mode) an optional branch name. */
export interface ContributeOptions {
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
export function contribute(
  opts: ContributeOptions
): AsyncGenerator<ContributionEvent, ContributionResult, void> {
  return protocolStream<ContributionEvent, ContributionResult>(PROTOCOL_CONTRIBUTE, 'run', [opts]);
}
