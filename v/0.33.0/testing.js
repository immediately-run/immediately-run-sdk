const GLOBAL_KEY = "__immediatelyRun__";
function createMockHost() {
  const handlers = /* @__PURE__ */ new Set();
  const sent = [];
  const protocolCalls = [];
  const responders = /* @__PURE__ */ new Map();
  const key = (protocol, method) => `${protocol}::${method}`;
  const transport = {
    sendMessage(type, data = {}) {
      sent.push({ type, data });
    },
    protocolRequest(protocol, method, params) {
      protocolCalls.push({ protocol, method, params });
      const responder = responders.get(key(protocol, method));
      if (!responder) {
        return Promise.reject(
          new Error(`mockHost: no stub for protocolRequest('${protocol}', '${method}')`)
        );
      }
      return Promise.resolve().then(() => responder(params));
    },
    onMessage(handler) {
      handlers.add(handler);
      return { dispose: () => handlers.delete(handler) };
    }
  };
  const g = globalThis;
  return {
    transport,
    install(extras = {}) {
      g[GLOBAL_KEY] = { ...extras, transport };
    },
    uninstall() {
      delete g[GLOBAL_KEY];
    },
    emit(msg) {
      for (const handler of [...handlers]) handler(msg);
    },
    stubProtocol(protocol, method, responder) {
      responders.set(key(protocol, method), responder);
    },
    sent,
    protocolCalls,
    handlerCount: () => handlers.size
  };
}
export {
  createMockHost
};
//# sourceMappingURL=testing.js.map