import "../chunk-VHAA22YE.js";
import { invoke } from "../catalog";
const listSpaces = (opts = {}) => invoke("spaces:list", opts);
const listAllSpaces = () => invoke("spaces:listAll", {});
const getSpaceMembers = (spaceId) => invoke("spaces:members", { spaceId });
const inviteToSpace = async (spaceId, login, role) => {
  await invoke("spaces:invite", { spaceId, login, role });
};
const unshareSpace = async (spaceId, uid) => {
  await invoke("spaces:unshare", { spaceId, uid });
};
const setSpaceRole = async (spaceId, uid, role) => {
  await invoke("spaces:setRole", { spaceId, uid, role });
};
const lookupUser = (login) => invoke("spaces:lookupUser", { login });
const listGrants = () => invoke("spaces:grants", {});
const revokeGrant = async (appKey, spaceId) => {
  await invoke("spaces:revokeGrant", { appKey, spaceId });
};
export {
  getSpaceMembers,
  inviteToSpace,
  listAllSpaces,
  listGrants,
  listSpaces,
  lookupUser,
  revokeGrant,
  setSpaceRole,
  unshareSpace
};
//# sourceMappingURL=spaces.js.map