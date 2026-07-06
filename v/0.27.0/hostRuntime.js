function getHostRuntime() {
  try {
    return globalThis.__immediatelyRun__ ?? null;
  } catch {
    return null;
  }
}
export {
  getHostRuntime
};
//# sourceMappingURL=hostRuntime.js.map