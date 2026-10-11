import "./chunk-VHAA22YE.js";
import { invoke } from "./catalog.js";
import { createPushChannel } from "./pushChannel.js";
import { throwOnRefusal } from "./protocolRefusal.js";
import { protocolRequest } from "./sandboxUtils.js";
import { PROTOCOL_VCS, REQUEST_VCS_STATE, VCS_STATE } from "./generated/protocol.js";
import { SCHEMES } from "./protocolSchemes.js";
const EMPTY = { changes: [], branch: null, prs: [], diffLoading: false };
const isChangeArray = (v) => Array.isArray(v) && v.every((c) => !!c && typeof c.path === "string" && typeof c.status === "string");
const parseAgentSession = (v) => {
  if (v === void 0 || v === null) return void 0;
  if (typeof v !== "object") return void 0;
  const s = v;
  if (typeof s.repo !== "string" || typeof s.conversationId !== "string" || typeof s.messageCount !== "number" || !Number.isFinite(s.messageCount) || typeof s.running !== "boolean" || s.updatedAt !== void 0 && (typeof s.updatedAt !== "number" || !Number.isFinite(s.updatedAt))) {
    return void 0;
  }
  return {
    repo: s.repo,
    conversationId: s.conversationId,
    messageCount: s.messageCount,
    running: s.running,
    ...s.updatedAt !== void 0 ? { updatedAt: s.updatedAt } : {}
  };
};
const isStringArray = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");
const isDiffWarningArray = (v) => Array.isArray(v) && v.every(
  (w) => !!w && typeof w === "object" && typeof w.kind === "string" && typeof w.path === "string" && typeof w.message === "string"
);
const REF_KINDS = /* @__PURE__ */ new Set(["branch", "tag", "commit"]);
const parseTarget = (v) => {
  if (v === null) return null;
  if (!v || typeof v !== "object") return void 0;
  const t = v;
  if (typeof t.namespace !== "string" || typeof t.repository !== "string" || typeof t.ref !== "string" || typeof t.refKind !== "string" || !REF_KINDS.has(t.refKind) || !(t.commitSha === null || typeof t.commitSha === "string" && t.commitSha !== "") || !(t.defaultBranch === null || typeof t.defaultBranch === "string")) {
    return void 0;
  }
  return {
    namespace: t.namespace,
    repository: t.repository,
    ref: t.ref,
    refKind: t.refKind,
    commitSha: t.commitSha,
    defaultBranch: t.defaultBranch
  };
};
const parseVcsFacts = (msg) => {
  const out = {};
  const target = parseTarget(msg.target);
  if (target !== void 0) out.target = target;
  const openPR = msg.openPR;
  if (openPR === null) out.openPR = null;
  else if (openPR && typeof openPR === "object" && typeof openPR.number === "number" && Number.isFinite(openPR.number) && typeof openPR.url === "string") {
    out.openPR = { number: openPR.number, url: openPR.url };
  }
  if (msg.defaultSaveMode === "pr" || msg.defaultSaveMode === "direct") out.defaultSaveMode = msg.defaultSaveMode;
  if (msg.canPushUpstream === null || typeof msg.canPushUpstream === "boolean")
    out.canPushUpstream = msg.canPushUpstream;
  if (typeof msg.manifestMissing === "boolean") out.manifestMissing = msg.manifestMissing;
  if (msg.diffError === null || typeof msg.diffError === "string") out.diffError = msg.diffError;
  if (isDiffWarningArray(msg.diffWarnings))
    out.diffWarnings = msg.diffWarnings.map(({ kind, path, message }) => ({ kind, path, message }));
  if (isStringArray(msg.excludedPhantoms)) out.excludedPhantoms = msg.excludedPhantoms;
  if (typeof msg.manifestTruncated === "boolean") out.manifestTruncated = msg.manifestTruncated;
  return out;
};
const channel = createPushChannel({
  pushType: VCS_STATE,
  requestType: REQUEST_VCS_STATE,
  initial: EMPTY,
  parse: (msg) => {
    if (!isChangeArray(msg.changes)) return void 0;
    const branch = msg.branch && typeof msg.branch === "object" ? msg.branch : null;
    const prs = Array.isArray(msg.prs) ? msg.prs : [];
    const agentSession = parseAgentSession(msg.agentSession);
    return {
      changes: msg.changes,
      branch,
      prs,
      diffLoading: msg.diffLoading === true,
      ...agentSession ? { agentSession } : {},
      // Each key is named here, not inside the helper, so the protocol snapshot's
      // `reads` records every field this parser consumes.
      ...parseVcsFacts({
        target: msg.target,
        openPR: msg.openPR,
        defaultSaveMode: msg.defaultSaveMode,
        canPushUpstream: msg.canPushUpstream,
        manifestMissing: msg.manifestMissing,
        diffError: msg.diffError,
        diffWarnings: msg.diffWarnings,
        excludedPhantoms: msg.excludedPhantoms,
        manifestTruncated: msg.manifestTruncated
      })
    };
  }
});
const getVcsState = () => channel.get();
const onVcsStateChange = (listener) => channel.onChange(listener);
const useVcsState = () => channel.use();
const vcsRequest = async (method, arg = {}) => {
  const res = await protocolRequest(SCHEMES[PROTOCOL_VCS], method, [arg]);
  throwOnRefusal(res, `vcs ${method} failed`);
};
const refreshDiff = () => vcsRequest("refreshDiff");
const refreshPRs = () => vcsRequest("refreshPRs");
const resetWorkingTree = () => vcsRequest("reset", { confirm: true });
const fromBase64 = (s) => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const bundleHead = async (mountId) => {
  const params = { mountId };
  return (await invoke("vcs:bundleHead", params)).sha;
};
const bundleLog = async (mountId, opts = {}) => {
  const params = { mountId };
  if (opts.since !== void 0) params.since = opts.since;
  if (opts.until !== void 0) params.until = opts.until;
  if (opts.max !== void 0) params.max = opts.max;
  return (await invoke("vcs:bundleLog", params)).commits;
};
const bundleIsAncestor = async (mountId, a, b) => {
  const params = { mountId, a, b };
  return (await invoke("vcs:bundleIsAncestor", params)).ancestor;
};
const bundleRead = async (mountId, sha, paths) => {
  const params = { mountId, sha, paths };
  const { files } = await invoke("vcs:bundleRead", params);
  const out = {};
  for (const [path, b64] of Object.entries(files)) out[path] = b64 === null ? null : fromBase64(b64);
  return out;
};
const bundleDiffPaths = async (mountId, from, to) => {
  const params = { mountId, from, to };
  return (await invoke("vcs:bundleDiffPaths", params)).paths;
};
const bundleCanWrite = async (mountId) => {
  const params = { mountId };
  return (await invoke("vcs:bundleCanWrite", params)).canWrite;
};
export {
  REF_KINDS,
  bundleCanWrite,
  bundleDiffPaths,
  bundleHead,
  bundleIsAncestor,
  bundleLog,
  bundleRead,
  getVcsState,
  onVcsStateChange,
  refreshDiff,
  refreshPRs,
  resetWorkingTree,
  useVcsState
};
//# sourceMappingURL=vcs.js.map