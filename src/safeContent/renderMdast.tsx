// R3-279 (phase 3): re-export shim — the implementation lives in
// `@immediately-run/safe-content`; this subpath keeps working byte-compatibly.
export { renderMdast } from '@immediately-run/safe-content';
export type { RenderMdastOptions, SafeContentComponents } from '@immediately-run/safe-content';
