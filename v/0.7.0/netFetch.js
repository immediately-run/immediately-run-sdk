import { protocolRequest } from "./sandboxUtils";
const hostFetch = async (url, init = {}) => {
  const res = await protocolRequest("fetch", "fetch", [
    { url, method: init.method, headers: init.headers, body: init.body }
  ]);
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? "hostFetch failed");
    err.code = (res && "code" in res ? res.code : void 0) ?? "unknown";
    throw err;
  }
  return res.data;
};
export {
  hostFetch
};
//# sourceMappingURL=netFetch.js.map