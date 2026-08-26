// R3-279 (phase 3): re-export shim — the implementation lives in
// `@immediately-run/safe-content`; this subpath keeps working byte-compatibly.
export { sanitizeUrl } from '@immediately-run/safe-content';
