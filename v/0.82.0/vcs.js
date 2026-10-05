import "./chunk-VHAA22YE.js";
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
      ...agentSession ? { agentSession } : {}
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
export {
  getVcsState,
  onVcsStateChange,
  refreshDiff,
  refreshPRs,
  resetWorkingTree,
  useVcsState
};
//# sourceMappingURL=vcs.js.map