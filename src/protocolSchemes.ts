// The `protocol-<scheme>` SCHEMES, derived from the wire names.
//
// `protocolRequest(scheme, method, params)` takes the scheme — `'theme'` — while the
// wire name the frame dispatches on is `'protocol-theme'`; the frame adds the prefix.
// So the typed service wrappers cannot pass the published `PROTOCOL_*` constant
// directly, and spelling the scheme inline would put a second, unguarded copy of the
// name back in the tree — exactly what R3-274c removes.
//
// Instead the schemes are *derived* from the wire names, keyed BY the wire name:
//
//   protocolRequest(SCHEMES[PROTOCOL_THEME], 'set', [{ theme }])
//
// Keying by the constant is what makes the derivation unfalsifiable — there is no
// second place to name the family, so there is no pair to get wrong. `schemeOf`
// returns a template-literal conditional, so each value has a literal type (`'theme'`),
// which buys two more things:
//
//   - a wire name that stops matching `protocol-*` stops compiling here, rather than
//     silently producing an empty scheme at runtime;
//   - `check-protocol-snapshot.mjs` resolves `SCHEMES[PROTOCOL_THEME]` through the type
//     checker exactly like a plain literal, so the call sites stay visible to the gate.
//
// One export, deliberately: `./*` is a public subpath, so every name added here is
// public API forever (ways_of_working §6, additive-only).
//
// This module is NOT generated — the derivation is the content — so it lives outside
// `src/generated/`.
import {
  PROTOCOL_ANALYTICS,
  PROTOCOL_CONTRIBUTE,
  PROTOCOL_DND,
  PROTOCOL_EDITOR,
  PROTOCOL_FEED,
  PROTOCOL_FETCH,
  PROTOCOL_IPC,
  PROTOCOL_LAUNCH,
  PROTOCOL_LLM,
  PROTOCOL_RECENTS,
  PROTOCOL_SECRETS,
  PROTOCOL_SETTINGS,
  PROTOCOL_SPACES,
  PROTOCOL_TASK,
  PROTOCOL_THEME,
  PROTOCOL_VCS,
} from './generated/protocol';

const PREFIX = 'protocol-';

/** The scheme half of a `protocol-<scheme>` wire name. */
type SchemeOf<N extends string> = N extends `${typeof PREFIX}${infer S}` ? S : never;

/**
 * `'protocol-theme'` → `'theme'`, as a literal type.
 *
 * The cast is the only place the derivation is asserted rather than computed; the
 * `N extends \`protocol-${string}\`` bound is what makes it sound — a wire name that is
 * not scheme-shaped is a compile error at the call, not a `never` at runtime.
 */
const schemeOf = <N extends `${typeof PREFIX}${string}`>(name: N): SchemeOf<N> =>
  name.slice(PREFIX.length) as SchemeOf<N>;

/** Every `protocol-*` scheme the SDK speaks, keyed by its wire name. */
export const SCHEMES = {
  [PROTOCOL_ANALYTICS]: schemeOf(PROTOCOL_ANALYTICS),
  [PROTOCOL_CONTRIBUTE]: schemeOf(PROTOCOL_CONTRIBUTE),
  [PROTOCOL_DND]: schemeOf(PROTOCOL_DND),
  [PROTOCOL_EDITOR]: schemeOf(PROTOCOL_EDITOR),
  [PROTOCOL_FEED]: schemeOf(PROTOCOL_FEED),
  [PROTOCOL_FETCH]: schemeOf(PROTOCOL_FETCH),
  [PROTOCOL_IPC]: schemeOf(PROTOCOL_IPC),
  [PROTOCOL_LAUNCH]: schemeOf(PROTOCOL_LAUNCH),
  [PROTOCOL_LLM]: schemeOf(PROTOCOL_LLM),
  [PROTOCOL_RECENTS]: schemeOf(PROTOCOL_RECENTS),
  [PROTOCOL_SECRETS]: schemeOf(PROTOCOL_SECRETS),
  [PROTOCOL_SETTINGS]: schemeOf(PROTOCOL_SETTINGS),
  [PROTOCOL_SPACES]: schemeOf(PROTOCOL_SPACES),
  [PROTOCOL_TASK]: schemeOf(PROTOCOL_TASK),
  [PROTOCOL_THEME]: schemeOf(PROTOCOL_THEME),
  [PROTOCOL_VCS]: schemeOf(PROTOCOL_VCS),
} as const;
