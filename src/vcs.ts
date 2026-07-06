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
import { createPushChannel } from './pushChannel';
import { protocolRequest } from './sandboxUtils';

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

/** The whole source-control snapshot the host projects to a `vcs:read` frame.
 *  Plain JSON — never a `DiffResult` / `FileSystem` / `Journal`. */
export interface VcsState {
  changes: VcsChange[];
  branch: VcsBranch | null;
  prs: VcsPR[];
  /** True while the host is recomputing the diff — the panel shows a spinner
   *  without a separate request (plan gotcha). */
  diffLoading: boolean;
}

/** Value before the host answers — also the value when the app may not read the
 *  channel (no `vcs:read`): an empty, branch-less snapshot. */
const EMPTY: VcsState = { changes: [], branch: null, prs: [], diffLoading: false };

const isChangeArray = (v: unknown): v is VcsChange[] =>
  Array.isArray(v) &&
  v.every(
    (c) =>
      !!c &&
      typeof (c as VcsChange).path === 'string' &&
      typeof (c as VcsChange).status === 'string',
  );

const channel = createPushChannel<VcsState>({
  pushType: 'vcs-state',
  requestType: 'request-vcs-state',
  initial: EMPTY,
  parse: (msg) => {
    // Require a well-formed `changes` array; tolerate an absent branch/prs. A
    // malformed push is ignored (returns undefined) so the last good state stands.
    if (!isChangeArray(msg.changes)) return undefined;
    const branch =
      msg.branch && typeof msg.branch === 'object' ? (msg.branch as VcsBranch) : null;
    const prs = Array.isArray(msg.prs) ? (msg.prs as VcsPR[]) : [];
    return {
      changes: msg.changes,
      branch,
      prs,
      diffLoading: msg.diffLoading === true,
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
export const onVcsStateChange = (listener: (state: VcsState) => void): (() => void) =>
  channel.onChange(listener);

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

/** An error from a `vcs` action, carrying a machine-readable `.code`. */
export interface VcsActionError extends Error {
  code:
    | 'forbidden' // the frame lacks the required capability (`vcs:read` / `vcs:reset`)
    | 'invalid-params' // reset called without `confirm: true`
    | 'no-target' // there is no host contribute session (not in edit mode)
    | 'unknown';
}

type VcsResult =
  | { ok: true; data: unknown }
  | { ok: false; code: string; message: string };

const vcsRequest = async (method: string, arg: Record<string, unknown> = {}): Promise<void> => {
  const res = (await protocolRequest('vcs', method, [arg])) as VcsResult;
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? `vcs ${method} failed`) as VcsActionError;
    err.code = (res?.code as VcsActionError['code']) ?? 'unknown';
    throw err;
  }
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
