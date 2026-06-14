import { useEffect, useState } from "react";
import { protocolRequest } from "./sandboxUtils";
import { getHostRuntime } from "./hostRuntime";
import { mountMatches } from "./mountMatch";
const getAppMountPath = () => getHostRuntime()?.appMountPath ?? "/app";
const mountService = () => {
  return module.evaluation.module.bundler.mounts;
};
const matches = (mount2, query) => mountMatches(mount2, query);
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
const mount = (mountId) => requestMountInternal("mount", { mount: mountId });
const mountSpace = (query) => mount(`space:${query.spaceId}`);
const requestMount = () => requestMountInternal("request", {});
const requestSpace = requestMount;
const makeContentRef = (ref, opts) => ({ $cap: "file", mountId: ref.mountId, relPath: ref.relPath, mode: opts.mode });
const resolveContentRef = async (ref) => {
  const path = await request("resolveRef", { ref });
  return { path };
};
const resolveContentRefs = async (refs) => {
  const paths = await request("resolveRefs", { refs });
  return { paths };
};
const settingsRequest = async (method, query = {}) => {
  const res = await protocolRequest("settings", method, [query]);
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? "settings request failed");
    err.code = res?.code ?? "unknown";
    throw err;
  }
  return res.data;
};
const openSettings = async () => {
  const mount2 = await settingsRequest("open");
  return waitForMount({ id: mount2.id ?? mount2.path });
};
const importSettingsFromParent = async () => {
  try {
    const data = await settingsRequest("importFromParent");
    return { ok: true, copied: data.copied };
  } catch (e) {
    return { ok: false, code: e.code ?? "unknown" };
  }
};
const openSettingsOf = async (appKey) => {
  const mount2 = await settingsRequest("openOf", { appKey });
  return waitForMount({ id: mount2.id ?? mount2.path });
};
const listSettingsApps = () => settingsRequest("list");
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
  getAppMountPath,
  getMounts,
  getSpaceMembers,
  importSettingsFromParent,
  listAllSpaces,
  listGrants,
  listSettingsApps,
  listSpaces,
  lookupUser,
  makeContentRef,
  mount,
  mountSpace,
  onMountsChange,
  openSettings,
  openSettingsOf,
  requestMount,
  requestSpace,
  resolveContentRef,
  resolveContentRefs,
  revokeGrant,
  setSpaceRole,
  shareSpace,
  unmountSpace,
  unshareSpace,
  useMounts,
  waitForMount
};
//# sourceMappingURL=mounts.js.map