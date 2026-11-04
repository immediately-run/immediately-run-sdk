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
    /** Prefer {@link VcsState.canPushUpstream}: the same fact, present even when
     *  `branch` is `null`. */
    upstreamPushable: boolean | null;
}
/** One warning from the host's diff. `kind` is open: today `'large-file'` or
 *  `'truncated-manifest-blind-spot'`, and a newer host may send others, so branch on
 *  the kinds you know and show `message` for the rest. */
interface VcsDiffWarning {
    kind: string;
    /** The repo-relative path the warning is about. */
    path: string;
    /** Human-readable text, ready to show. */
    message: string;
}
/** What the working tree was loaded from (the host manifest), so a form can name and
 *  link the target and apply §15.0 rule 2 on a tag or commit load. */
interface VcsTarget {
    namespace: string;
    repository: string;
    ref: string;
    refKind: 'branch' | 'tag' | 'commit';
    /** The loaded commit; `null` when the manifest records none (a REST-built manifest
     *  can carry no based-on commit), so a form shows no commit link. */
    commitSha: string | null;
    /** The repository's live default branch; `null` while the host does not know it. */
    defaultBranch: string | null;
}
/** One pull request open from the current branch (host `BranchPR`). */
interface VcsPR {
    number: number;
    url: string;
    title: string;
    state: 'open' | 'closed' | 'merged';
    draft: boolean;
}
/** The gate facts the host projects about an active agent session on the
 *  target repo (CONTRIBUTE_TRANSCRIPT_SPEC §3/§4, R3-632/R3-659): enough for a
 *  contribute app to render the "Commit session transcript" checkbox — never
 *  transcript bytes, a title, or message content. Absent (undefined) unless a
 *  qualifying session exists — R-CT-3: no session ⇒ no fact, not a disabled
 *  rendering of one. */
interface VcsAgentSession {
    repo: string;
    conversationId: string;
    messageCount: number;
    updatedAt?: number | undefined;
    running: boolean;
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
    /** See {@link VcsAgentSession}. Present only while a qualifying agent
     *  session exists on the target repo. The explicit `| undefined` mirrors
     *  the wire contract exactly (the wire-shape extractor reads union members
     *  literally). */
    agentSession?: VcsAgentSession | null | undefined;
    /** What the working tree was loaded from; `null` when there is no manifest. */
    target?: VcsTarget | null | undefined;
    /** The open pull request whose head is the loaded branch, projected host-side. On the
     *  snapshot, not on `branch`, because `branch` is `null` when no sidecar names the
     *  branch (another device), which is exactly when this is needed. `null` means known:
     *  none open; absent means an older host that does not say. `prs` lists every PR the
     *  host polled; this names the one whose head is the working branch. */
    openPR?: {
        number: number;
        url: string;
    } | null | undefined;
    /** The save mode a contribute form opens on (CONTRIBUTE_SPEC §15.0 rule 4). The host
     *  says `direct` only on a branch that is the user's; absent means `pr`. A default,
     *  never a permission: `direct` still needs `contribute:direct`. */
    defaultSaveMode?: 'pr' | 'direct' | undefined;
    /** Whether the user can push to the target repository; `null` while probing. The same
     *  fact as `branch.upstreamPushable`, but present when `branch` is `null`; prefer this
     *  one when both are set. */
    canPushUpstream?: boolean | null | undefined;
    /** True when the load has no manifest, so contributions are unavailable. The
     *  authoritative "no manifest" signal: `target` is `null` exactly when this is true. */
    manifestMissing?: boolean | undefined;
    /** The last diff refresh's failure; `null` after a good refresh. */
    diffError?: string | null | undefined;
    /** The diff's warnings. */
    diffWarnings?: VcsDiffWarning[] | undefined;
    /** Repo-relative paths walked but left out of the changeset: today only the
     *  `.immediately.run/` platform sidecar files, never the user's own work. */
    excludedPhantoms?: string[] | undefined;
    /** The manifest is truncated: saving is locked out (CONTRIBUTE_SPEC §7). */
    manifestTruncated?: boolean | undefined;
}
/** The refKind values the parser keeps (exported so the suite derives its cases from the
 *  producer rather than probing one favourite member — every member must pass through,
 *  because a miss silently drops the whole target fact). */
declare const REF_KINDS: Set<string>;
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
/** An error from a `vcs` action, carrying a machine-readable `.code`.
 *
 *  **What you actually catch.** The SDK throws a plain `Error` with `.code` assigned — a
 *  `CodedRefusalError` from `protocolRefusal.ts` — never a distinct class. This interface
 *  documents the `.code` VALUES the host sends. Nothing enforces the union at runtime —
 *  `.code` is whatever string arrived — so treat an unlisted code as possible and
 *  `instanceof Error` as the only reliable test.
 */
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
/** One first-parent commit of a bundle's history. */
interface BundleCommit {
    sha: string;
    /** The first parent, or null for a root commit. */
    parent: string | null;
    message: string;
}
/**
 * A refused bundle-history call. `code` is one of: `forbidden` (the app lacks `vcs:read`,
 * or does not hold the mount), `unsupported` (the mount has no repository history — a
 * space, a local tree — or the tree is too large to compare), `invalid-params` (a
 * malformed sha or path, more than 100 paths or 5 MiB in one read, or a log longer than
 * `max` — the message then starts `history-too-long`), `not-found` (no such commit),
 * `budget` (the provider's rate limit is exhausted; `retryAfter` carries its wait in
 * seconds when it sent one), `unknown`. Nothing enforces the union at runtime — treat an
 * unlisted code as possible.
 */
interface BundleHistoryError extends Error {
    code: 'forbidden' | 'unsupported' | 'invalid-params' | 'not-found' | 'budget' | 'unknown';
    retryAfter?: number;
}
/** The commit the bundle's ref points at now. Cheap to poll: the host asks GitHub
 *  conditionally, so an unchanged head costs no rate limit. */
declare const bundleHead: (mountId: string) => Promise<string>;
/** First-parent commits, oldest first, from `until` (default: the head) back to — not
 *  including — `since` (default: the root). A merge's second-parent commits never
 *  appear. Refused (`invalid-params`, `history-too-long`) beyond `max` (default 200,
 *  at most 1000) — never silently truncated. */
declare const bundleLog: (mountId: string, opts?: {
    since?: string;
    until?: string;
    max?: number;
}) => Promise<BundleCommit[]>;
/** Whether commit `a` is an ancestor of commit `b` (reflexive: a commit is its own). */
declare const bundleIsAncestor: (mountId: string, a: string, b: string) => Promise<boolean>;
/** Files at commit `sha`, by bundle-relative path; `null` where there is no file. At
 *  most 100 paths and 5 MiB per call. */
declare const bundleRead: (mountId: string, sha: string, paths: string[]) => Promise<Record<string, Uint8Array | null>>;
/** The bundle-relative paths that differ between two commits (added, removed or changed). */
declare const bundleDiffPaths: (mountId: string, from: string, to: string) => Promise<string[]>;
/** Whether the signed-in user may push to the bundle's repository (false signed out).
 *  Use it to hide a publish affordance the user could not complete. */
declare const bundleCanWrite: (mountId: string) => Promise<boolean>;

export { type BundleCommit, type BundleHistoryError, REF_KINDS, type VcsActionError, type VcsAgentSession, type VcsBranch, type VcsChange, type VcsDiffWarning, type VcsPR, type VcsState, type VcsTarget, bundleCanWrite, bundleDiffPaths, bundleHead, bundleIsAncestor, bundleLog, bundleRead, getVcsState, onVcsStateChange, refreshDiff, refreshPRs, resetWorkingTree, useVcsState };
