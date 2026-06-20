import { useEffect, useState } from "react";
import { protocolRequest, sendMessage, addListener } from "./sandboxUtils";
const startItemDrag = async (item) => {
  const res = await protocolRequest("dnd", "startDrag", [item]);
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? "dnd startDrag failed");
    err.code = res?.code ?? "unknown";
    throw err;
  }
};
const cancelItemDrag = () => {
  sendMessage("dnd-cancel", {});
};
const onItemDrop = (listener) => addListener(
  "dropped-item",
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