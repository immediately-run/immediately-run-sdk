import "./chunk-VHAA22YE.js";
import { useContext } from "react";
import { TinkerableContext } from "./TinkerableContext";
import { useAuth } from "./auth";
import { useMounts } from "./mounts";
import { fenceUntrusted } from "./fence";
function useAgentContext(app = {}) {
  const tinker = useContext(TinkerableContext);
  const auth = useAuth();
  const mounts = useMounts();
  const nav = tinker?.navigationState;
  return {
    repository: nav?.repository ?? "",
    revision: nav?.ref ?? "",
    ...auth.status === "signed-in" || auth.status === "signed-out" ? { signedIn: auth.status === "signed-in" } : {},
    // unknown ⇒ omitted, never guessed
    mounts: mounts.map((m) => ({ path: m.path, ...m.mode ? { mode: m.mode } : {} })),
    // Fail-closed (PERSISTENCE §7A.6): a git-backed source classifies shared until
    // sole authorship of the full reachable history is verifiable — which it is not
    // today — so both packagings (dispatched repo, fork's own repo) read as
    // "treated as if others can write".
    sourceShared: true,
    sourceSharedBasis: "git-indeterminate",
    ...app
  };
}
function renderAgentContext(block) {
  const payload = {
    repository: block.repository,
    revision: block.revision,
    ...block.signedIn === void 0 ? {} : { signedIn: block.signedIn },
    mounts: block.mounts,
    sourceShared: block.sourceShared,
    ...block.entryPath !== void 0 ? { entryPath: block.entryPath } : {},
    ...block.entryTitle !== void 0 ? { entryTitle: block.entryTitle } : {},
    ...block.heading !== void 0 ? { heading: block.heading } : {},
    ...block.selection !== void 0 ? { selection: block.selection } : {}
  };
  return fenceUntrusted("agent-context", JSON.stringify(payload, null, 2));
}
export {
  renderAgentContext,
  useAgentContext
};
//# sourceMappingURL=agentContext.js.map