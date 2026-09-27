import "./chunk-VHAA22YE.js";
import { useEffect, useState } from "react";
import { protocolRequest, addListener } from "./sandboxUtils.js";
import { PROTOCOL_IPC, REGION_MESSAGE } from "./generated/protocol.js";
import { SCHEMES } from "./protocolSchemes.js";
const postToRegion = async (region, data) => {
  const res = await protocolRequest(SCHEMES[PROTOCOL_IPC], "post", [{ to: region, msg: data }]);
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? "ipc post failed");
    err.code = res?.code ?? "unknown";
    throw err;
  }
};
const revealRegion = async (region) => {
  const res = await protocolRequest(SCHEMES[PROTOCOL_IPC], "reveal", [{ to: region }]);
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? "ipc reveal failed");
    err.code = res?.code ?? "unknown";
    throw err;
  }
};
const onRegionMessage = (listener) => addListener(REGION_MESSAGE, (m) => listener({ from: m.from, data: m.data }));
const useRegionMessage = () => {
  const [msg, setMsg] = useState(null);
  useEffect(() => onRegionMessage(setMsg), []);
  return msg;
};
export {
  onRegionMessage,
  postToRegion,
  revealRegion,
  useRegionMessage
};
//# sourceMappingURL=ipc.js.map