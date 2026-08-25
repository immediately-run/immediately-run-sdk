// Safe content rendering — non-executable MDX (TRUST_MODES_SPEC §5.1, AGENT_AUTHORING
// §10). The host/SDK-owned renderer an INTERPRETER app uses to render untrusted
// Markdown/MDX-syntax content as data, with **no evaluator anywhere in the pipeline**.
// This is the mandatory terminal for the MDX-from-mount gate (§10 delta 1) — a shared
// (multi-writer / M3) board or wiki entry MUST render through here, never compiled MDX.
//
// It is a **T2 tool, not a platform gate**: it stops content executing as code; it does
// not certify anything to the host, and CO-4 data-fencing is still required for anything
// that *reads* the content (the agent case).

export { SafeContent } from './SafeContent';
export type { SafeContentProps } from './SafeContent';
export { renderMdast } from './renderMdast';
export type { RenderMdastOptions, SafeContentComponents } from './renderMdast';
export { parseSafeMdast } from './parseSafeMdast';
export type { SafeMdastNode, SafeMdxAttribute, ParseSafeMdastOptions } from './parseSafeMdast';
export { sanitizeUrl } from './sanitizeUrl';
export { splitWikiLinks, parseWikiInner } from './wikilink';
export type { WikiLinkToken, WikiPart } from './wikilink';
