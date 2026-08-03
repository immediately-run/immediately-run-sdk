import {
  __privateAdd,
  __privateGet,
  __privateSet
} from "./chunk-VHAA22YE.js";
var _status, _dismissListeners, _ended;
import { protocolRequest, sendMessage, addListener } from "./sandboxUtils";
const liveHandles = /* @__PURE__ */ new Map();
addListener("launch-ended", (m) => {
  const h = liveHandles.get(m.launchId);
  if (h) h._end(m.status);
});
class LaunchHandleImpl {
  constructor(launchId) {
    this.launchId = launchId;
    __privateAdd(this, _status, "running");
    __privateAdd(this, _dismissListeners, /* @__PURE__ */ new Set());
    __privateAdd(this, _ended, false);
    liveHandles.set(launchId, this);
  }
  get status() {
    return __privateGet(this, _status);
  }
  dismiss() {
    if (__privateGet(this, _ended)) return;
    sendMessage("launch-dismiss", { launchId: this.launchId });
  }
  onDismiss(cb) {
    if (__privateGet(this, _ended)) {
      queueMicrotask(cb);
      return () => {
      };
    }
    __privateGet(this, _dismissListeners).add(cb);
    return () => {
      __privateGet(this, _dismissListeners).delete(cb);
    };
  }
  /** Host-driven terminal transition — the only writer of `status`. Idempotent. */
  _end(status) {
    if (__privateGet(this, _ended)) return;
    __privateSet(this, _ended, true);
    __privateSet(this, _status, status);
    liveHandles.delete(this.launchId);
    const listeners = [...__privateGet(this, _dismissListeners)];
    __privateGet(this, _dismissListeners).clear();
    for (const l of listeners) {
      try {
        l();
      } catch {
      }
    }
  }
}
_status = new WeakMap();
_dismissListeners = new WeakMap();
_ended = new WeakMap();
const launch = async (target, opts) => {
  const res = await protocolRequest("launch", "create", [{ target, opts }]);
  if (!res || res.ok !== true || !res.data?.launchId) {
    const code = res && res.ok === false ? res.code ?? "unknown" : "unknown";
    return { ok: false, code };
  }
  return new LaunchHandleImpl(res.data.launchId);
};
export {
  launch
};
//# sourceMappingURL=launch.js.map