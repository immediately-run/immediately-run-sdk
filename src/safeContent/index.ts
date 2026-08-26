// Safe content rendering — non-executable MDX (TRUST_MODES_SPEC §5.1, AGENT_AUTHORING
// §10). The host/SDK-owned renderer an INTERPRETER app uses to render untrusted
// Markdown/MDX-syntax content as data, with **no evaluator anywhere in the pipeline**.
// This is the mandatory terminal for the MDX-from-mount gate (§10 delta 1) — a shared
// (multi-writer / M3) board or wiki entry MUST render through here, never compiled MDX.
//
// It is a **T2 tool, not a platform gate**: it stops content executing as code; it does
// not certify anything to the host, and CO-4 data-fencing is still required for anything
// that *reads* the content (the agent case).
//
// R3-279 (phase 3): the implementation now lives in `@immediately-run/safe-content`
// (the S3 content-framework tier's first extraction). This module — and every sibling
// subpath below — is a byte-compat RE-EXPORT: `api-snapshot.json` is unchanged, every
// existing `@immediately-run/sdk/safeContent/*` import keeps working, and no consumer
// changes anywhere.
export * from '@immediately-run/safe-content';
