const injectedBundler = () => {
  try {
    return module?.evaluation?.module?.bundler ?? null;
  } catch {
    return null;
  }
};
const getInjectedMetadataEmitter = () => {
  const b = injectedBundler();
  if (b && typeof b.onMetadataChange === "function" && b.onMetadataChangeEmitter) {
    return {
      onMetadataChange: b.onMetadataChange,
      enable: () => b.onMetadataChangeEmitter.enable()
    };
  }
  return null;
};
const resolveMetadataSource = (injected) => injected ? { event: injected.onMetadataChange, enable: () => injected.enable() } : { event: void 0, enable: () => {
} };
export {
  getInjectedMetadataEmitter,
  resolveMetadataSource
};
//# sourceMappingURL=injectedBundler.js.map