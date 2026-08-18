import "./chunk-VHAA22YE.js";
import { createPushChannel } from "./pushChannel";
import { protocolRequest } from "./sandboxUtils";
import { PROTOCOL_VCS, REQUEST_VCS_STATE, VCS_STATE } from "./generated/protocol";
import { SCHEMES } from "./protocolSchemes";
const EMPTY = { changes: [], branch: null, prs: [], diffLoading: false };
const isChangeArray = (v) => Array.isArray(v) && v.every(
  (c) => !!c && typeof c.path === "string" && typeof c.status === "string"
);
const channel = createPushChannel({
  pushType: VCS_STATE,
  requestType: REQUEST_VCS_STATE,
  initial: EMPTY,
  parse: (msg) => {
    if (!isChangeArray(msg.changes)) return void 0;
    const branch = msg.branch && typeof msg.branch === "object" ? msg.branch : null;
    const prs = Array.isArray(msg.prs) ? msg.prs : [];
    return {
      changes: msg.changes,
      branch,
      prs,
      diffLoading: msg.diffLoading === true
    };
  }
});
const getVcsState = () => channel.get();
const onVcsStateChange = (listener) => channel.onChange(listener);
const useVcsState = () => channel.use();
const vcsRequest = async (method, arg = {}) => {
  const res = await protocolRequest(SCHEMES[PROTOCOL_VCS], method, [arg]);
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? `vcs ${method} failed`);
    err.code = res?.code ?? "unknown";
    throw err;
  }
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