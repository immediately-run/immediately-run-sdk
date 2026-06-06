import { useEffect, useState } from "react";
import { protocolRequest } from "./sandboxUtils";
import { consumeStream } from "./protocolStream";
const split = (name) => {
  const i = name.indexOf(":");
  if (i <= 0) throw new Error(`invalid catalog method name: ${name}`);
  return [name.slice(0, i), name.slice(i + 1)];
};
const invoke = async (name, params = {}) => {
  const [scheme, method] = split(name);
  const res = await protocolRequest(scheme, method, [params]);
  if (!res || res.ok !== true) {
    const err = new Error(res?.message ?? `${name} failed`);
    err.code = res?.code ?? "unknown";
    throw err;
  }
  return res.data;
};
const bundlerTransport = {
  send: (msg) => (
    // @ts-ignore - injected by the sandbox runtime
    module.evaluation.module.bundler.messageBus.sendMessage(msg.type, msg)
  ),
  subscribe: (type, handler) => {
    const d = module.evaluation.module.bundler.messageBus.onMessage((m) => {
      if (m && m.type === type) handler(m);
    });
    return () => d.dispose();
  }
};
function invokeStream(name, params = {}) {
  const [scheme, method] = split(name);
  return consumeStream(bundlerTransport, `protocol-${scheme}`, method, [params]);
}
const catalogService = () => {
  return module.evaluation.module.bundler.catalog;
};
const getCatalog = () => catalogService().getCatalog();
const onCatalogChange = (listener) => {
  const disposable = catalogService().onChange(listener);
  return () => disposable.dispose();
};
const useCatalog = () => {
  const [catalog, setCatalog] = useState(getCatalog);
  useEffect(() => onCatalogChange(setCatalog), []);
  return catalog;
};
export {
  getCatalog,
  invoke,
  invokeStream,
  onCatalogChange,
  useCatalog
};
//# sourceMappingURL=catalog.js.map