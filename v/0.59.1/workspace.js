import "./chunk-VHAA22YE.js";
import { createPushChannel } from "./pushChannel";
import { WORKSPACE, REQUEST_WORKSPACE } from "./generated/protocol";
const DEFAULT_WORKSPACE = null;
const isWorkspace = (v) => {
  const w = v;
  return !!w && typeof w === "object" && typeof w.provider === "string" && typeof w.namespace === "string" && typeof w.repository === "string" && typeof w.ref === "string" && typeof w.label === "string";
};
const channel = createPushChannel({
  pushType: WORKSPACE,
  requestType: REQUEST_WORKSPACE,
  initial: DEFAULT_WORKSPACE,
  parse: (msg) => {
    if (msg.workspace === null) return null;
    if (!isWorkspace(msg.workspace)) return void 0;
    const { provider, namespace, repository, ref, label } = msg.workspace;
    return { provider, namespace, repository, ref, label };
  }
});
const getWorkspace = () => channel.get();
const onWorkspaceChange = (listener) => channel.onChange(listener);
const useWorkspace = () => channel.use();
export {
  getWorkspace,
  onWorkspaceChange,
  useWorkspace
};
//# sourceMappingURL=workspace.js.map