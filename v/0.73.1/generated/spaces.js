import "../chunk-VHAA22YE.js";
import { invoke } from "../catalog.js";
const withTry = (fn, fallback) => Object.assign(fn, {
  try: async (...args) => {
    try {
      return { ok: true, value: await fn(...args) };
    } catch (e) {
      return { ok: false, code: e.code ?? fallback };
    }
  }
});
const listSpaces = withTry(
  (opts = {}) => invoke("spaces:list", opts),
  "unknown"
);
const listAllSpaces = withTry(
  () => invoke("spaces:listAll", {}),
  "unknown"
);
const getSpaceMembers = withTry(
  (spaceId) => invoke("spaces:members", { spaceId }),
  "unknown"
);
const inviteToSpace = withTry(
  async (spaceId, login, role) => {
    await invoke("spaces:invite", { spaceId, login, role });
  },
  "unknown"
);
const unshareSpace = withTry(
  async (spaceId, uid) => {
    await invoke("spaces:unshare", { spaceId, uid });
  },
  "unknown"
);
const setSpaceRole = withTry(
  async (spaceId, uid, role) => {
    await invoke("spaces:setRole", { spaceId, uid, role });
  },
  "unknown"
);
const lookupUser = withTry(
  (login) => invoke("spaces:lookupUser", { login }),
  "unknown"
);
const listGrants = withTry(
  () => invoke("spaces:grants", {}),
  "unknown"
);
const revokeGrant = withTry(
  async (appKey, spaceId) => {
    await invoke("spaces:revokeGrant", { appKey, spaceId });
  },
  "unknown"
);
const listPendingInvites = withTry(
  (spaceId) => invoke("spaces:pendingInvites", { spaceId }),
  "unknown"
);
const revokeInvite = withTry(
  async (spaceId, uid) => {
    await invoke("spaces:revokeInvite", { spaceId, uid });
  },
  "unknown"
);
const listMyInvites = withTry(
  () => invoke("spaces:listInvites", {}),
  "unknown"
);
const acceptInvite = withTry(
  async (spaceId) => {
    await invoke("spaces:acceptInvite", { spaceId });
  },
  "unknown"
);
const declineInvite = withTry(
  async (spaceId) => {
    await invoke("spaces:declineInvite", { spaceId });
  },
  "unknown"
);
export {
  acceptInvite,
  declineInvite,
  getSpaceMembers,
  inviteToSpace,
  listAllSpaces,
  listGrants,
  listMyInvites,
  listPendingInvites,
  listSpaces,
  lookupUser,
  revokeGrant,
  revokeInvite,
  setSpaceRole,
  unshareSpace
};
//# sourceMappingURL=spaces.js.map