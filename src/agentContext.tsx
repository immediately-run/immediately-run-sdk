// The deixis context block (GROVE_AGENT_SPEC §5) — platform primitive B.
//
// The user's first questions are indexical: *this* wiki, *this* entry, *this*
// section. The agent should never need a tool call to know where it is. The SDK
// assembles the PLATFORM half (repository/ref, sign-in status, mounts, source trust)
// and the app spreads in its local fields (entry, heading, selection).
//
// TWO RULES (normative, G-GA-5):
//   1. The block is DATA IN A FENCE — never instructions (threat_model P8) — and it
//      EGRESSES to the provider like everything else in the prompt (R-GA-6), which
//      is exactly why identity stays out: `signedIn` is a boolean from the baseline
//      `auth:status` projection; the login/user belongs to `auth:identity`, and
//      collapsing that split (threat_model T6) widens the egress for convenience.
//   2. `signedIn` is OMITTED while auth status is `unknown` — three states, because
//      collapsing `unknown` to `false` is the R3-300 false-banner bug class.
import { useContext } from 'react';
import { TinkerableContext } from './TinkerableContext';
import { useAuth } from './auth';
import { useMounts } from './mounts';
import { fenceUntrusted } from './fence';

/** The app-local half of the deixis block — supplied by the app at call time. */
export interface AgentContextAppFields {
  /** The entry the reader is on (app router's key/path). */
  entryPath?: string;
  /** Its display title. */
  entryTitle?: string;
  /** The `#fragment` the app resolved — "the section you're looking at". */
  heading?: string;
  /** Future: selected text as deixis. */
  selection?: string;
}

/** The whole block, as it enters the loop. */
export interface AgentContextBlock {
  repository: string;
  revision: string;
  /** Omitted while auth status is `unknown` (R3-300). Status only — never identity. */
  signedIn?: boolean;
  mounts: Array<{ path: string; mode?: string }>;
  /** Whether the source is treated as "others can write here" (feeds the reach
   * card's row and the copy under it). */
  sourceShared: boolean;
  /** Why `sourceShared` reads as it does — today the git classifier is fail-closed
   * indeterminate (`PERSISTENCE §7A.6` Q11), so a git-backed corpus is treated as
   * shared with the softer copy; a mount trust-mode API would replace this basis. */
  sourceSharedBasis: 'git-indeterminate' | 'mount-trust-mode';
  entryPath?: string;
  entryTitle?: string;
  heading?: string;
  selection?: string;
}

/**
 * Assemble the deixis block: the platform fields from the SDK's own state, the app's
 * local fields spread in. Additive-only; the app passes new local fields as they
 * exist.
 */
export function useAgentContext(app: AgentContextAppFields = {}): AgentContextBlock {
  const tinker = useContext(TinkerableContext);
  const auth = useAuth();
  const mounts = useMounts();
  const nav = tinker?.navigationState;
  return {
    repository: nav?.repository ?? '',
    revision: nav?.ref ?? '',
    ...(auth.status === 'signed-in' || auth.status === 'signed-out' ? { signedIn: auth.status === 'signed-in' } : {}), // unknown ⇒ omitted, never guessed
    mounts: mounts.map((m) => ({ path: m.path, ...(m.mode ? { mode: m.mode } : {}) })),
    // Fail-closed (PERSISTENCE §7A.6): a git-backed source classifies shared until
    // sole authorship of the full reachable history is verifiable — which it is not
    // today — so both packagings (dispatched repo, fork's own repo) read as
    // "treated as if others can write".
    sourceShared: true,
    sourceSharedBasis: 'git-indeterminate',
    ...app,
  };
}

/** Serialize the block as the fenced data segment that enters the system prompt.
 * Every field is attacker-influenced only through repo/mount metadata — still, the
 * fence is unconditional (R-GA-7): the block is corpus-derived data. */
export function renderAgentContext(block: AgentContextBlock): string {
  // Field allowlist, deliberately: nothing joins the prompt except the fields named
  // here (G-GA-5's allowlist assertion reads this shape).
  const payload = {
    repository: block.repository,
    revision: block.revision,
    ...(block.signedIn === undefined ? {} : { signedIn: block.signedIn }),
    mounts: block.mounts,
    sourceShared: block.sourceShared,
    ...(block.entryPath !== undefined ? { entryPath: block.entryPath } : {}),
    ...(block.entryTitle !== undefined ? { entryTitle: block.entryTitle } : {}),
    ...(block.heading !== undefined ? { heading: block.heading } : {}),
    ...(block.selection !== undefined ? { selection: block.selection } : {}),
  };
  return fenceUntrusted('agent-context', JSON.stringify(payload, null, 2));
}
