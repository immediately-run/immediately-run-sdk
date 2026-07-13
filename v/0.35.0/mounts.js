import "./chunk-VHAA22YE.js";
import { useEffect, useState } from "react";
import { protocolRequest, sendMessage, addListener } from "./sandboxUtils";
import { createPushChannel } from "./pushChannel";
import { getHostRuntime } from "./hostRuntime";
import { mountMatches } from "./mountMatch";
const getAppMountPath = () => getHostRuntime()?.appMountPath ?? "/app";
const mountKey = (m) => m.id ?? m.path;
const MOUNT_REMOVE_REASONS = /* @__PURE__ */ new Set([
  "revoked",
  "unshared",
  "signed-out",
  "unmounted",
  "deleted"
]);
const asMountRemoveReason = (value) => typeof value === "string" && MOUNT_REMOVE_REASONS.has(value) ? value : "revoked";
const injectedMountService = () => {
  try {
    const svc = module?.evaluation?.module?.bundler?.mounts;
    return svc && typeof svc.getMounts === "function" ? svc : null;
  } catch {
    return null;
  }
};
let transportSvc = null;
const transportMountService = () => {
  if (transportSvc) return transportSvc;
  let mounts = [];
  const listeners = /* @__PURE__ */ new Set();
  const fire = (removed) => {
    for (const l of [...listeners]) l(mounts, removed);
  };
  addListener("mount-add", (msg) => {
    const mount2 = msg.mount;
    if (!mount2) return;
    const key = mountKey(mount2);
    mounts = [...mounts.filter((m) => mountKey(m) !== key), mount2];
    fire([]);
  });
  addListener("mount-remove", (msg) => {
    const key = msg.id ?? msg.path;
    if (key == null) return;
    const reason = asMountRemoveReason(msg.reason);
    const removed = mounts.filter((m) => mountKey(m) === key).map((m) => ({ ...m, reason }));
    if (removed.length === 0) return;
    mounts = mounts.filter((m) => mountKey(m) !== key);
    fire(removed);
  });
  try {
    sendMessage("request-mounts");
  } catch {
  }
  transportSvc = {
    getMounts: () => mounts,
    onChange: (listener) => {
      listeners.add(listener);
      listener(mounts, []);
      return { dispose: () => listeners.delete(listener) };
    }
  };
  return transportSvc;
};
const mountService = () => injectedMountService() ?? transportMountService();
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
const sessionMountsChannel = createPushChannel({
  pushType: "session-mounts",
  requestType: "request-session-mounts",
  initial: [],
  parse: (msg) => Array.isArray(msg.mounts) ? msg.mounts : void 0
});
const getSessionMounts = () => sessionMountsChannel.get();
const onSessionMountsChange = (listener) => sessionMountsChannel.onChange(listener);
const useSessionMounts = () => sessionMountsChannel.use();
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
const inviteToSpace = async (spaceId, login, role) => {
  await request("invite", { spaceId, login, role });
};
const listPendingInvites = (spaceId) => request("pendingInvites", { spaceId });
const revokeInvite = async (spaceId, uid) => {
  await request("revokeInvite", { spaceId, uid });
};
const listMyInvites = () => request("listInvites", {});
const acceptInvite = async (spaceId) => {
  await request("acceptInvite", { spaceId });
};
const declineInvite = async (spaceId) => {
  await request("declineInvite", { spaceId });
};
const invitesChannel = createPushChannel({
  pushType: "invitations",
  requestType: "request-invitations",
  initial: [],
  parse: (msg) => Array.isArray(msg.invites) ? msg.invites : void 0
});
const getInvites = () => invitesChannel.get();
const onInvitesChange = (listener) => invitesChannel.onChange(listener);
const useInvites = () => invitesChannel.use();
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
  acceptInvite,
  createSpace,
  declineInvite,
  findMount,
  getAppMountPath,
  getInvites,
  getMounts,
  getSessionMounts,
  getSpaceMembers,
  importSettingsFromParent,
  inviteToSpace,
  listAllSpaces,
  listGrants,
  listMyInvites,
  listPendingInvites,
  listSettingsApps,
  listSpaces,
  lookupUser,
  makeContentRef,
  mount,
  mountSpace,
  onInvitesChange,
  onMountsChange,
  onSessionMountsChange,
  openSettings,
  openSettingsOf,
  requestMount,
  requestSpace,
  resolveContentRef,
  resolveContentRefs,
  revokeGrant,
  revokeInvite,
  setSpaceRole,
  unmountSpace,
  unshareSpace,
  useInvites,
  useMounts,
  useSessionMounts,
  waitForMount
};
//# sourceMappingURL=mounts.js.map