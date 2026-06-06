import { useEffect, useState } from "react";
import { protocolRequest } from "./sandboxUtils";
const mountService = () => {
  return module.evaluation.module.bundler.mounts;
};
const matches = (mount2, query) => (query.type === void 0 || mount2.type === query.type) && (query.id === void 0 || mount2.id === query.id) && (query.path === void 0 || mount2.path === query.path);
const getMounts = () => mountService().getMounts();
const findMount = (query) => getMounts().find((m) => matches(m, query));
const onMountsChange = (listener) => {
  const disposable = mountService().onChange(listener);
  return () => disposable.dispose();
};
const waitForMount = (query) => new Promise((resolve) => {
  const unsubscribe = onMountsChange((mounts) => {
    const found = mounts.find((m) => matches(m, query));
    if (found) {
      Promise.resolve().then(unsubscribe);
      resolve(found);
    }
  });
});
const useMounts = () => {
  const [mounts, setMounts] = useState(getMounts);
  useEffect(() => onMountsChange(setMounts), []);
  return mounts;
};
const request = async (method, query = {}) => {
  const res = await protocolRequest("spaces", method, [query]);
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? "space request failed");
    err.code = res?.code ?? "unknown";
    throw err;
  }
  return res.data;
};
const requestMountInternal = async (method, query) => {
  const mount2 = await request(method, query);
  return waitForMount({ id: mount2.id ?? mount2.path });
};
const openAppSpace = (slot = "default") => requestMountInternal("open", { slot });
const mount = (mountId) => requestMountInternal("mount", { mount: mountId });
const mountSpace = (query) => mount(`space:${query.spaceId}`);
const requestMount = () => requestMountInternal("request", {});
const requestSpace = requestMount;
const createSpace = (opts = {}) => requestMountInternal("create", opts);
const listSpaces = (opts = {}) => request("list", opts);
const unmountSpace = async (query) => {
  await request("unmount", query);
};
const listAllSpaces = () => request("listAll", {});
const getSpaceMembers = (spaceId) => request("members", { spaceId });
const shareSpace = async (spaceId, login, role) => {
  await request("share", { spaceId, login, role });
};
const unshareSpace = async (spaceId, uid) => {
  await request("unshare", { spaceId, uid });
};
const setSpaceRole = async (spaceId, uid, role) => {
  await request("setRole", { spaceId, uid, role });
};
const lookupUser = (login) => request("lookupUser", { login });
const listGrants = () => request("grants", {});
const revokeGrant = async (appKey, spaceId) => {
  await request("revokeGrant", { appKey, spaceId });
};
export {
  createSpace,
  findMount,
  getMounts,
  getSpaceMembers,
  listAllSpaces,
  listGrants,
  listSpaces,
  lookupUser,
  mount,
  mountSpace,
  onMountsChange,
  openAppSpace,
  requestMount,
  requestSpace,
  revokeGrant,
  setSpaceRole,
  shareSpace,
  unmountSpace,
  unshareSpace,
  useMounts,
  waitForMount
};
//# sourceMappingURL=mounts.js.map