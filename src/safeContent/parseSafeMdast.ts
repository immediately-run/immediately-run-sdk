// R3-279 (phase 3): re-export shim — the implementation lives in
// `@immediately-run/safe-content`; this subpath keeps working byte-compatibly.
export { parseSafeMdast } from '@immediately-run/safe-content';
export type { SafeMdastNode, SafeMdxAttribute, ParseSafeMdastOptions } from '@immediately-run/safe-content';
