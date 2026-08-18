// The `protocol-<scheme>` SCHEMES, derived from the wire names.
//
// `protocolRequest(scheme, method, params)` takes the scheme — `'theme'` — while the
// wire name the frame dispatches on is `'protocol-theme'`; the frame adds the prefix.
// So the typed service wrappers cannot pass the published `PROTOCOL_*` constant
// directly, and spelling `'theme'` inline would put a second, unguarded copy of the
// name back in the tree — exactly what R3-274c removes.
//
// Instead each scheme is *derived* from its wire name at the type level: `schemeOf`
// returns a template-literal conditional, so `SCHEME_THEME` has the literal type
// `'theme'`. Two consequences that matter:
//
//   - the wire name stays the single source — renaming it in the descriptors renames
//     the scheme, and a name that stops matching `protocol-*` stops compiling;
//   - `check-protocol-snapshot.mjs` resolves these through the type checker exactly
//     like any other constant, so the call sites stay visible to the gate.
//
// This module is NOT generated: the derivation is the content. It lives outside
// `src/generated/` for that reason.
import {
  PROTOCOL_CONTRIBUTE,
  PROTOCOL_DND,
  PROTOCOL_EDITOR,
  PROTOCOL_FETCH,
  PROTOCOL_IPC,
  PROTOCOL_LAUNCH,
  PROTOCOL_LLM,
  PROTOCOL_SECRETS,
  PROTOCOL_SETTINGS,
  PROTOCOL_SPACES,
  PROTOCOL_TASK,
  PROTOCOL_THEME,
  PROTOCOL_VCS,
} from './generated/protocol';

const PREFIX = 'protocol-';

/** The scheme half of a `protocol-<scheme>` wire name. */
export type SchemeOf<N extends string> = N extends `${typeof PREFIX}${infer S}` ? S : never;

/**
 * `PROTOCOL_THEME` (`'protocol-theme'`) → `'theme'`, as a literal type.
 *
 * The cast is the only place the derivation is asserted rather than computed; the
 * `N extends \`protocol-${string}\`` bound is what makes it sound — a wire name that
 * is not scheme-shaped is a compile error at the call, not a `never` at runtime.
 */
const schemeOf = <N extends `${typeof PREFIX}${string}`>(name: N): SchemeOf<N> =>
  name.slice(PREFIX.length) as SchemeOf<N>;

export const SCHEME_CONTRIBUTE = schemeOf(PROTOCOL_CONTRIBUTE);
export const SCHEME_DND = schemeOf(PROTOCOL_DND);
export const SCHEME_EDITOR = schemeOf(PROTOCOL_EDITOR);
export const SCHEME_FETCH = schemeOf(PROTOCOL_FETCH);
export const SCHEME_IPC = schemeOf(PROTOCOL_IPC);
export const SCHEME_LAUNCH = schemeOf(PROTOCOL_LAUNCH);
export const SCHEME_LLM = schemeOf(PROTOCOL_LLM);
export const SCHEME_SECRETS = schemeOf(PROTOCOL_SECRETS);
export const SCHEME_SETTINGS = schemeOf(PROTOCOL_SETTINGS);
export const SCHEME_SPACES = schemeOf(PROTOCOL_SPACES);
export const SCHEME_TASK = schemeOf(PROTOCOL_TASK);
export const SCHEME_THEME = schemeOf(PROTOCOL_THEME);
export const SCHEME_VCS = schemeOf(PROTOCOL_VCS);
