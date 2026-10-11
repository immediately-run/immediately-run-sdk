/** The app-local half of the deixis block — supplied by the app at call time. */
interface AgentContextAppFields {
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
interface AgentContextBlock {
    repository: string;
    revision: string;
    /** Omitted while auth status is `unknown` (R3-300). Status only — never identity. */
    signedIn?: boolean;
    mounts: Array<{
        path: string;
        mode?: string;
    }>;
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
declare function useAgentContext(app?: AgentContextAppFields): AgentContextBlock;
/** Serialize the block as the fenced data segment that enters the system prompt.
 * Every field is attacker-influenced only through repo/mount metadata — still, the
 * fence is unconditional (R-GA-7): the block is corpus-derived data. */
declare function renderAgentContext(block: AgentContextBlock): string;

export { type AgentContextAppFields, type AgentContextBlock, renderAgentContext, useAgentContext };
