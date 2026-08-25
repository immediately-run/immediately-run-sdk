export * from './MDXProvider';
export * from './routing';
export * from './boot';
export * from './components/Include';
// Only the component is public. `stripFrontmatter`/`appMountRelative` are module-level
// exports so they can be unit-tested directly, NOT public API — the SDK's surface is
// backwards-compatible forever, so an internal helper exported for a test's convenience is a
// permanent commitment made for the wrong reason.
export { SafeInclude } from './components/SafeInclude';
export * from './sourceCache';
export * from './components/MDXComponents';
export * from './linkSpace';
export * from './components/MountImage';
export * from './components/Routes';
export * from './hooks';
// R3-276: the supported way for a viewer app to provide its own metadata store,
// replacing a wholesale re-provision of `TinkerableContext` in app code.
export * from './metadataSource';
// The deprecated injected-bundler adapters, re-exported so their deprecation notices
// are visible in the published docs (R3-278; the window only narrows).
export { getInjectedMetadataEmitter, getInjectedMetadataSnapshot } from './injectedBundler';
export * from './auth';
export * from './theme';
export * from './editorContext';
export * from './editor';
export * from './formFactor';
export * from './hostAttention';
export * from './region';
export * from './mounts';
export * from './contribute';
export * from './catalog';
export * from './ipc';
export * from './dnd';
export * from './netFetch';
export * from './secrets';
export * from './llm';
export * from './diagnostics';
export * from './vcs';
export * from './onFsChange';
export * from './fs';
export * from './debug';
export * from './tasks';
export * from './launch';
export * from './runtime';
export * from './irMarkers';
export * from './ready';
export * from './loading';
export * from './protocolStream';
export * from './protocolDeadline';
export * from './sandboxTypes';
export * from './safeContent';
