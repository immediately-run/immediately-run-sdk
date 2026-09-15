import "./chunk-VHAA22YE.js";
import { useEffect, useState } from "react";
import { protocolRequest, sendMessage, addListener } from "./sandboxUtils";
import { DND_CANCEL, DROPPED_ITEM, PROTOCOL_DND } from "./generated/protocol";
import { SCHEMES } from "./protocolSchemes";
const startItemDrag = async (item) => {
  const res = await protocolRequest(SCHEMES[PROTOCOL_DND], "startDrag", [item]);
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? "dnd startDrag failed");
    err.code = res?.code ?? "unknown";
    throw err;
  }
};
const cancelItemDrag = () => {
  sendMessage(DND_CANCEL, {});
};
const onItemDrop = (listener) => addListener(
  DROPPED_ITEM,
  (m) => listener({ item: m.item, from: m.from, position: m.position })
);
const useDroppedItem = () => {
  const [dropped, setDropped] = useState(null);
  useEffect(() => onItemDrop(setDropped), []);
  return dropped;
};
export {
  cancelItemDrag,
  onItemDrop,
  startItemDrag,
  useDroppedItem
};
//# sourceMappingURL=dnd.js.map