import "./chunk-VHAA22YE.js";
import { protocolRequest } from "./sandboxUtils.js";
import { throwOnRefusal } from "./protocolRefusal.js";
import { createPushChannel } from "./pushChannel.js";
import { SPACES_MODE, REQUEST_SPACES_MODE, PROTOCOL_SPACES_MODE } from "./generated/protocol.js";
import { SCHEMES } from "./protocolSchemes.js";
const ACTIVITIES = ["spaces", "inbox", "people", "settings"];
const ROLES = ["owner", "writer", "reader"];
const KINDS = ["personal", "shared"];
const isRecord = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const optionalString = (v) => v === void 0 || typeof v === "string";
const parseRoute = (v) => {
  if (!isRecord(v)) return void 0;
  if (typeof v.activity !== "string" || !ACTIVITIES.includes(v.activity)) return void 0;
  if (!(v.spaceId === null || typeof v.spaceId === "string")) return void 0;
  if (!optionalString(v.path) || !optionalString(v.roomId)) return void 0;
  if (!optionalString(v.member) || !optionalString(v.section)) return void 0;
  const route = {
    spaceId: v.spaceId,
    activity: v.activity
  };
  if (typeof v.path === "string") route.path = v.path;
  if (typeof v.roomId === "string") route.roomId = v.roomId;
  if (typeof v.member === "string") route.member = v.member;
  if (typeof v.section === "string") route.section = v.section;
  return route;
};
const parseSpace = (v) => {
  if (v === null) return null;
  if (!isRecord(v)) return void 0;
  if (typeof v.id !== "string" || typeof v.name !== "string") return void 0;
  if (typeof v.role !== "string" || !ROLES.includes(v.role)) return void 0;
  if (typeof v.kind !== "string" || !KINDS.includes(v.kind)) return void 0;
  if (!(v.root === null || typeof v.root === "string")) return void 0;
  return {
    id: v.id,
    name: v.name,
    role: v.role,
    kind: v.kind,
    root: v.root
  };
};
const parseState = (state) => {
  if (state === null) return null;
  if (!isRecord(state)) return void 0;
  const route = parseRoute(state.route);
  if (!route) return void 0;
  const space = parseSpace(state.space);
  if (space === void 0) return void 0;
  return { route, space };
};
const channel = createPushChannel({
  pushType: SPACES_MODE,
  requestType: REQUEST_SPACES_MODE,
  initial: null,
  // Written inline, reading `msg.state` here rather than inside the helper: the snapshot
  // gate extracts a push channel's `reads` from THIS expression, and a bare function
  // reference tells it nothing — it falls back to the parameter type and the wire shape
  // reads `Record<string, unknown>` instead of `{reads:["state"]}`.
  parse: (msg) => parseState(msg.state)
});
const getSpacesMode = () => channel.get();
const onSpacesModeChange = (listener) => channel.onChange(listener);
const useSpacesMode = () => channel.use();
async function navigateSpaces(target) {
  const res = await protocolRequest(SCHEMES[PROTOCOL_SPACES_MODE], "navigate", [target]);
  throwOnRefusal(res, "spaces navigation refused");
}
export {
  getSpacesMode,
  navigateSpaces,
  onSpacesModeChange,
  useSpacesMode
};
//# sourceMappingURL=spacesMode.js.map