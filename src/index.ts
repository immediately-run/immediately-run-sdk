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
export * from './bundle';
// Deprecated `Corpus*` spellings of the above (R3-482); see `src/corpus.ts`.
export * from './corpus';
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
export * from './chromeState';
export * from './workspace';
export * from './hostAttention';
export * from './region';
// R3-708 — the spaces mode's route channel and its one navigation verb.
export * from './spacesMode';
export * from './mounts';
export * from './analytics';
export * from './contribute';
export * from './catalog';
export * from './ipc';
export * from './dnd';
export * from './netFetch';
export * from './feed';
export * from './secrets';
export * from './recents'; // R3-485: the gated recent-projects read (page.home)
export * from './openRepository'; // R3-476: host-mediated open-in-a-new-tab (route:read)
export * from './openExternal'; // R3-619: host-brokered outward-link open (link:open)
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
export * from './dialog';
export * from './status';
export * from './protocolStream';
export * from './protocolDeadline';
export * from './sandboxTypes';
export * from './safeContent';
// R3-489 (GROVE_AGENT_SPEC): the embedded-agent seam every app shares — the tool-use
// loop ported from agent-demo (`runAgent` over the host chat slot), the MDX metadata
// query tool, the headings index collector, the deixis context block, and the fence
// for corpus-derived bytes entering a loop.
export * from './agentLoop';
export * from './agentSteering';
export * from './agentPause';
export * from './agentChatClient';
export * from './metadataQueryTool';
export * from './collectHeadings';
export * from './agentContext';
export * from './fence';
export * from './platformLink';
// R3-627: the per-history-entry scratch, and the scroll restoration built on it —
// Back lands where the reader left, for however many entries deep they go.
export * from './entryState';
export * from './useEntryState';
export * from './scrollRestore';
export { ScrollRestoration, type ScrollRestorationProps } from './components/ScrollRestoration';
