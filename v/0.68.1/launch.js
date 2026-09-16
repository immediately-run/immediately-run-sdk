import {
  __privateAdd,
  __privateGet,
  __privateSet
} from "./chunk-VHAA22YE.js";
var _status, _dismissListeners, _ended;
import { protocolRequest, sendMessage, addListener } from "./sandboxUtils";
import { LAUNCH_DISMISS, LAUNCH_ENDED, PROTOCOL_LAUNCH } from "./generated/protocol";
import { SCHEMES } from "./protocolSchemes";
const liveHandles = /* @__PURE__ */ new Map();
const pendingEnded = /* @__PURE__ */ new Map();
const MAX_PENDING_ENDED = 16;
let createsInFlight = 0;
let endedListenerRegistered = false;
const ensureEndedListener = () => {
  if (endedListenerRegistered) return;
  try {
    addListener(LAUNCH_ENDED, (m) => {
      const h = liveHandles.get(m.launchId);
      if (h) {
        h._end(m.status);
        return;
      }
      if (createsInFlight === 0) return;
      if (pendingEnded.size >= MAX_PENDING_ENDED) {
        const oldest = pendingEnded.keys().next();
        if (!oldest.done) pendingEnded.delete(oldest.value);
      }
      pendingEnded.set(m.launchId, m.status);
    });
  } catch {
    return;
  }
  endedListenerRegistered = true;
};
class LaunchHandleImpl {
  constructor(launchId) {
    this.launchId = launchId;
    __privateAdd(this, _status, "running");
    __privateAdd(this, _dismissListeners, /* @__PURE__ */ new Set());
    __privateAdd(this, _ended, false);
    liveHandles.set(launchId, this);
    const early = pendingEnded.get(launchId);
    if (early !== void 0) {
      pendingEnded.delete(launchId);
      this._end(early);
    }
  }
  get status() {
    return __privateGet(this, _status);
  }
  dismiss() {
    if (__privateGet(this, _ended)) return;
    sendMessage(LAUNCH_DISMISS, { launchId: this.launchId });
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
  ensureEndedListener();
  createsInFlight += 1;
  let res;
  try {
    res = await protocolRequest(SCHEMES[PROTOCOL_LAUNCH], "create", [{ target, opts }]);
  } finally {
    createsInFlight -= 1;
  }
  const sweep = () => {
    if (createsInFlight === 0) pendingEnded.clear();
  };
  if (!res || res.ok !== true || !res.data?.launchId) {
    sweep();
    const code = res && res.ok === false ? res.code ?? "unknown" : "unknown";
    return { ok: false, code };
  }
  const handle = new LaunchHandleImpl(res.data.launchId);
  sweep();
  return handle;
};
export {
  launch
};
//# sourceMappingURL=launch.js.map