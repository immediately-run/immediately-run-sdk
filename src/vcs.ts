// The `vcs:read` / `vcs:reset` source-control surface — app-facing wrappers
// (UI_AS_APPS_SPEC §5.3 Recipe A read channel + §8.4 Recipe B actions;
// migrate-sidebars-to-apps Phase 05; roadmap R3-52).
//
// A first-party contribute panel (the `panel.contribute` app, Phase 06) reads the
// live source-control state the native `SourceControlPanel` shows — the working-tree
// diff summary, the branch lineage, and the open-PR list — and can trigger a
// refresh/reset. The host derives all of it from authenticated GitHub calls +
// the COW layers; NONE of the underlying `DiffResult` / `FileSystem` / OAuth token
// ever crosses the boundary (§8.10) — the wire carries only the plain-JSON
// {@link VcsState} the host projects.
//
// Read side: a Recipe-A push channel, the same get/onChange/use trio as
// `editorContext` / `diagnostics`. Inert until the host wires the channel
// (site-main `channelBridge`); an app without `vcs:read` simply sees the empty
// initial. Action side: `protocol-vcs` requests gated host-side — `refreshDiff` /
// `refreshPRs` by `vcs:read`, `resetWorkingTree` by first-party-only `vcs:reset`.
import { invoke } from './catalog';
import { createPushChannel } from './pushChannel';
import { throwOnRefusal } from './protocolRefusal';
import { protocolRequest } from './sandboxUtils';
import { PROTOCOL_VCS, REQUEST_VCS_STATE, VCS_STATE } from './generated/protocol';
import { SCHEMES } from './protocolSchemes';

/** One changed path in the working tree (vs. the loaded ref). `status` mirrors the
 *  host `DiffResult` change kinds; `path` is repo-relative. Contents are NOT
 *  carried — the native panel showed path + status, and a per-file content diff is
 *  a deferred follow-up (plan step 6). */
export interface VcsChange {
  path: string;
  status: 'created' | 'modified' | 'deleted';
}

/** The branch the working tree sits on and the upstream it diverged from
 *  (host `BranchInfo`, §15.1). `null` until the user is on a immediately.run-created
 *  branch. `upstreamPushable` is `null` while push access is still being probed. */
export interface VcsBranch {
  name: string;
  parentRepo: string;
  parentRef: string;
  parentCommitSha: string;
  upstreamPushable: boolean | null;
}

/** One pull request open from the current branch (host `BranchPR`). */
export interface VcsPR {
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
export interface VcsAgentSession {
  repo: string;
  conversationId: string;
  messageCount: number;
  updatedAt?: number | undefined;
  running: boolean;
}

/** The whole source-control snapshot the host projects to a `vcs:read` frame.
 *  Plain JSON — never a `DiffResult` / `FileSystem` / `Journal`. */
export interface VcsState {
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
}

/** Value before the host answers — also the value when the app may not read the
 *  channel (no `vcs:read`): an empty, branch-less snapshot. */
const EMPTY: VcsState = { changes: [], branch: null, prs: [], diffLoading: false };

const isChangeArray = (v: unknown): v is VcsChange[] =>
  Array.isArray(v) &&
  v.every((c) => !!c && typeof (c as VcsChange).path === 'string' && typeof (c as VcsChange).status === 'string');

// The agentSession fact is fail-closed for the transcript feature (R-CT-1): a
// malformed one reads as NO session — dropped, never thrown into the vcs
// channel, so a fault can never conjure a checkbox (and the rest of the
// snapshot still lands).
const parseAgentSession = (v: unknown): VcsAgentSession | undefined => {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'object') return undefined;
  const s = v as Record<string, unknown>;
  // Number.isFinite, not typeof: structured clone (the postMessage transport)
  // carries NaN/Infinity intact, and a non-finite count must not conjure the
  // fact — the producer's parser (site-main agentSessionState.ts) rejects the
  // same way.
  if (
    typeof s.repo !== 'string' ||
    typeof s.conversationId !== 'string' ||
    typeof s.messageCount !== 'number' ||
    !Number.isFinite(s.messageCount) ||
    typeof s.running !== 'boolean' ||
    (s.updatedAt !== undefined && (typeof s.updatedAt !== 'number' || !Number.isFinite(s.updatedAt)))
  ) {
    return undefined;
  }
  return {
    repo: s.repo,
    conversationId: s.conversationId,
    messageCount: s.messageCount,
    running: s.running,
    ...(s.updatedAt !== undefined ? { updatedAt: s.updatedAt } : {}),
  };
};

const channel = createPushChannel<VcsState>({
  pushType: VCS_STATE,
  requestType: REQUEST_VCS_STATE,
  initial: EMPTY,
  parse: (msg) => {
    // Require a well-formed `changes` array; tolerate an absent branch/prs. A
    // malformed push is ignored (returns undefined) so the last good state stands.
    if (!isChangeArray(msg.changes)) return undefined;
    const branch = msg.branch && typeof msg.branch === 'object' ? (msg.branch as VcsBranch) : null;
    const prs = Array.isArray(msg.prs) ? (msg.prs as VcsPR[]) : [];
    const agentSession = parseAgentSession(msg.agentSession);
    return {
      changes: msg.changes,
      branch,
      prs,
      diffLoading: msg.diffLoading === true,
      ...(agentSession ? { agentSession } : {}),
    };
  },
});

/** One-off read of the current source-control state. Returns the empty snapshot
 *  until the host answers (or if the app lacks `vcs:read`). Use
 *  {@link onVcsStateChange} / {@link useVcsState} to react to live updates. */
export const getVcsState = (): VcsState => channel.get();

/** Subscribe to source-control changes. Invoked immediately with the current
 *  value, then on every host push (diff refresh, PR poll, branch change). Returns
 *  an unsubscribe. */
export const onVcsStateChange = (listener: (state: VcsState) => void): (() => void) => channel.onChange(listener);

/** React hook: the current source-control state, re-rendering on every change. */
export const useVcsState = (): VcsState => channel.use();

// ---------------------------------------------------------------------------
// Actions (Recipe B, §8.4). The app NAMES an intent and the HOST performs it —
// the COW/journal stays in the kernel (§2/§4). `refreshDiff`/`refreshPRs` only
// cause a host-side recompute + a fresh push (gated `vcs:read`, no new authority);
// `resetWorkingTree` DISCARDS the user's unsaved work, gated by the first-party-only
// `vcs:reset` — a fork can never hold it. The arm-then-confirm UX stays in the app;
// the authority is gated host-side (§8.9), and the host requires `confirm:true` as
// belt-and-braces (T22).
// ---------------------------------------------------------------------------

/** An error from a `vcs` action, carrying a machine-readable `.code`.
 *
 *  **What you actually catch.** The SDK throws a plain `Error` with `.code` assigned — a
 *  `CodedRefusalError` from `protocolRefusal.ts` — never a distinct class. This interface
 *  documents the `.code` VALUES the host sends. Nothing enforces the union at runtime —
 *  `.code` is whatever string arrived — so treat an unlisted code as possible and
 *  `instanceof Error` as the only reliable test.
 */
export interface VcsActionError extends Error {
  code:
    | 'forbidden' // the frame lacks the required capability (`vcs:read` / `vcs:reset`)
    | 'invalid-params' // reset called without `confirm: true`
    | 'no-target' // there is no host contribute session (not in edit mode)
    | 'unknown';
}

type VcsResult = { ok: true; data: unknown } | { ok: false; code: string; message: string };

const vcsRequest = async (method: string, arg: Record<string, unknown> = {}): Promise<void> => {
  const res = (await protocolRequest(SCHEMES[PROTOCOL_VCS], method, [arg])) as VcsResult;
  throwOnRefusal(res, `vcs ${method} failed`);
};

/** Ask the host to recompute the working-tree diff and push a fresh {@link VcsState}.
 *  Gated `vcs:read`. Rejects with a {@link VcsActionError} (`.code`). */
export const refreshDiff = (): Promise<void> => vcsRequest('refreshDiff');

/** Ask the host to re-poll the open PRs and push a fresh {@link VcsState}. Gated
 *  `vcs:read`. Rejects with a {@link VcsActionError} (`.code`). */
export const refreshPRs = (): Promise<void> => vcsRequest('refreshPRs');

/** Ask the host to DISCARD the working tree (COW writable wipe + journal clear) —
 *  irreversible. First-party-only (`vcs:reset`); a fork/preview is refused at the
 *  gate. Requires `confirm: true` (host belt-and-braces). Rejects with a
 *  {@link VcsActionError} (`.code`). */
export const resetWorkingTree = (): Promise<void> => vcsRequest('reset', { confirm: true });

// ---------------------------------------------------------------------------------------
// R3-954 — bundle history (COLLABORATION_SESSIONS §16). Read-only history of a
// GitHub-backed bundle mount THIS app holds (the URL-dispatched corpus, or the editor's
// working tree): the head of its ref, the first-parent log, ancestry, files at a past
// commit, changed paths, and the user's write permission. Gated `vcs:read`; the host
// refuses a mount the app does not hold `forbidden`. Paths are bundle-relative (relative
// to the mount's content directory). Each call is a literal `invoke('vcs:…')` so the
// wire-shape gate (`protocol:check`) records its fields against the published protocol.

/** One first-parent commit of a bundle's history. */
export interface BundleCommit {
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
export interface BundleHistoryError extends Error {
  code: 'forbidden' | 'unsupported' | 'invalid-params' | 'not-found' | 'budget' | 'unknown';
  retryAfter?: number;
}

const fromBase64 = (s: string): Uint8Array => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

/** The commit the bundle's ref points at now. Cheap to poll: the host asks GitHub
 *  conditionally, so an unchanged head costs no rate limit. */
export const bundleHead = async (mountId: string): Promise<string> => {
  const params: { mountId: string } = { mountId };
  return (await invoke<{ sha: string }>('vcs:bundleHead', params)).sha;
};

/** First-parent commits, oldest first, from `until` (default: the head) back to — not
 *  including — `since` (default: the root). A merge's second-parent commits never
 *  appear. Refused (`invalid-params`, `history-too-long`) beyond `max` (default 200,
 *  at most 1000) — never silently truncated. */
export const bundleLog = async (
  mountId: string,
  opts: { since?: string; until?: string; max?: number } = {},
): Promise<BundleCommit[]> => {
  const params: { mountId: string; since?: string; until?: string; max?: number } = { mountId };
  if (opts.since !== undefined) params.since = opts.since;
  if (opts.until !== undefined) params.until = opts.until;
  if (opts.max !== undefined) params.max = opts.max;
  return (await invoke<{ commits: BundleCommit[] }>('vcs:bundleLog', params)).commits;
};

/** Whether commit `a` is an ancestor of commit `b` (reflexive: a commit is its own). */
export const bundleIsAncestor = async (mountId: string, a: string, b: string): Promise<boolean> => {
  const params: { mountId: string; a: string; b: string } = { mountId, a, b };
  return (await invoke<{ ancestor: boolean }>('vcs:bundleIsAncestor', params)).ancestor;
};

/** Files at commit `sha`, by bundle-relative path; `null` where there is no file. At
 *  most 100 paths and 5 MiB per call. */
export const bundleRead = async (
  mountId: string,
  sha: string,
  paths: string[],
): Promise<Record<string, Uint8Array | null>> => {
  const params: { mountId: string; sha: string; paths: string[] } = { mountId, sha, paths };
  const { files } = await invoke<{ files: Record<string, string | null> }>('vcs:bundleRead', params);
  const out: Record<string, Uint8Array | null> = {};
  for (const [path, b64] of Object.entries(files)) out[path] = b64 === null ? null : fromBase64(b64);
  return out;
};

/** The bundle-relative paths that differ between two commits (added, removed or changed). */
export const bundleDiffPaths = async (mountId: string, from: string, to: string): Promise<string[]> => {
  const params: { mountId: string; from: string; to: string } = { mountId, from, to };
  return (await invoke<{ paths: string[] }>('vcs:bundleDiffPaths', params)).paths;
};

/** Whether the signed-in user may push to the bundle's repository (false signed out).
 *  Use it to hide a publish affordance the user could not complete. */
export const bundleCanWrite = async (mountId: string): Promise<boolean> => {
  const params: { mountId: string } = { mountId };
  return (await invoke<{ canWrite: boolean }>('vcs:bundleCanWrite', params)).canWrite;
};
