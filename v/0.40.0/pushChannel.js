import "./chunk-VHAA22YE.js";
import { useEffect, useState } from "react";
import { sendMessage as defaultSend, addListener as defaultAddListener } from "./sandboxUtils";
function createPushChannel(opts, transport = { sendMessage: defaultSend, addListener: defaultAddListener }) {
  let current = opts.initial;
  const listeners = /* @__PURE__ */ new Set();
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    transport.addListener(opts.pushType, (msg) => {
      const next = opts.parse(msg);
      if (next !== void 0) {
        current = next;
        listeners.forEach((l) => l(current));
      }
    });
    if (opts.requestType) {
      try {
        transport.sendMessage(opts.requestType);
      } catch {
      }
    }
  };
  const get = () => {
    start();
    return current;
  };
  const onChange = (listener) => {
    start();
    listeners.add(listener);
    listener(current);
    return () => {
      listeners.delete(listener);
    };
  };
  const use = () => {
    const [value, setValue] = useState(get);
    useEffect(() => onChange(setValue), []);
    return value;
  };
  return { get, onChange, use };
}
export {
  createPushChannel
};
//# sourceMappingURL=pushChannel.js.map