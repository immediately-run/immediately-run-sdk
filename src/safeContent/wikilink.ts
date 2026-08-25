// R3-279 (phase 3): re-export shim — the implementation lives in
// `@immediately-run/safe-content`; this subpath keeps working byte-compatibly.
export { splitWikiLinks, parseWikiInner } from '@immediately-run/safe-content';
export type { WikiLinkToken, WikiPart } from '@immediately-run/safe-content';
