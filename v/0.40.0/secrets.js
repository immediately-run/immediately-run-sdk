import "./chunk-VHAA22YE.js";
import { protocolRequest } from "./sandboxUtils";
import { createPushChannel } from "./pushChannel";
const request = async (method, query = {}) => {
  const res = await protocolRequest("secrets", method, [query]);
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? "secret request failed");
    err.code = res?.code ?? "unknown";
    throw err;
  }
  return res.data;
};
const requestAddSecret = (hints = {}) => request("add", hints);
const requestSecret = (query = {}) => request("request", query);
const revokeSecret = async (id) => {
  await request("revoke", { id });
};
const channel = createPushChannel({
  pushType: "secrets-metadata",
  requestType: "request-secrets-metadata",
  initial: [],
  parse: (msg) => Array.isArray(msg.secrets) ? msg.secrets : void 0
});
const getSecrets = () => channel.get();
const onSecretsChange = (listener) => channel.onChange(listener);
const useSecrets = () => channel.use();
export {
  getSecrets,
  onSecretsChange,
  requestAddSecret,
  requestSecret,
  revokeSecret,
  useSecrets
};
//# sourceMappingURL=secrets.js.map