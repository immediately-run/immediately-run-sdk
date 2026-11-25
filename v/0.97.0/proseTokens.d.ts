/** The default token file's name. The one place this name is spelled. */
declare const PROSE_TOKEN_FILE = "immediately.run.css";
/** The bundle marker that may carry a `styles` field naming another token file. */
declare const PROSE_MARKER_FILE = "immediately.run.json";
/** A token file larger than this is refused unread: it sits on the first-paint path. */
declare const PROSE_TOKEN_FILE_MAX_BYTES = 16384;
/** A single value longer than this is dropped. */
declare const PROSE_TOKEN_VALUE_MAX_LENGTH = 256;
/** The polarity the host theme reports, and the block that applies to it. */
type ProsePolarity = 'light' | 'dark';
/** Values per block, keyed by the public custom property (`--ink`). */
interface ProseTokenBlocks {
    readonly root: Readonly<Record<string, string>>;
    readonly light: Readonly<Record<string, string>>;
    readonly dark: Readonly<Record<string, string>>;
}
/** The outcome of parsing a token file. `warnings` name every dropped declaration. */
type ParsedProseTokenFile = {
    readonly ok: true;
    readonly blocks: ProseTokenBlocks;
    readonly warnings: readonly string[];
} | {
    readonly ok: false;
    readonly reason: string;
};
/**
 * Parse a token file. All-or-nothing per file for its SHAPE (Grove plans 05 §3, the rule
 * Grove's check-theme-token-only script enforces): any at-rule, any selector but the
 * three token blocks, or any property that is not a custom property refuses the whole file.
 * Per declaration for its CONTENT: an unknown token name or a refused value is dropped with
 * a warning and the rest of the file applies.
 */
declare function parseProseTokenFile(text: string): ParsedProseTokenFile;
/**
 * The values to set for one polarity, in application order: `:root` first, then the
 * polarity block, so a polarity value wins over the shared one.
 */
declare function tokensFor(blocks: ProseTokenBlocks, polarity: ProsePolarity): [string, string][];
/**
 * Reads the lookup needs, injected so the walk is tested without a filesystem. Paths are
 * repo-relative with no leading slash (`''` is the repo root).
 * - `size`: the byte size of a regular file, or `null` when there is none;
 * - `read`: a file's UTF-8 text, or `null` when there is none.
 */
interface ProseTokenProbe {
    size(path: string): Promise<number | null>;
    read(path: string): Promise<string | null>;
}
/** Where the walk landed: the token file to read (or none), and what to warn about. */
interface ResolvedTokenFile {
    /** The repo-relative token file, or `null` when no author tokens apply. */
    readonly path: string | null;
    /** Its size in bytes when `path` is set. */
    readonly size: number | null;
    /**
     * The file a change should re-run the lookup for: `path`, or the file a marker's `styles`
     * names while it does not exist yet, so creating it restyles the page.
     */
    readonly watch: string | null;
    /** The directory the walk stopped in (`''` is the repo root). */
    readonly dir: string;
    readonly warnings: readonly string[];
}
/** The directory of a repo-relative file path. */
declare const dirOfFile: (file: string) => string;
/**
 * Find the token file for Markdown in `startDir`. Walk up to the repo root and stop at the
 * first directory holding a marker or the default token file. There, a marker's `styles`
 * string names the file, `styles: false` turns author tokens off, and otherwise the default
 * file applies if it exists. Every refusal is a warning and leaves the defaults in place.
 */
declare function resolveTokenFile(startDir: string, probe: ProseTokenProbe): Promise<ResolvedTokenFile>;
/**
 * Does a changed repo-relative path bear on the token lookup for `startDir`? True for the
 * watched token file (`ResolvedTokenFile.watch`), and for any marker or default token file in a directory the walk
 * visits (one created or deleted there moves the lookup).
 */
declare function affectsTokenLookup(changed: string, startDir: string, watched: string | null): boolean;

export { PROSE_MARKER_FILE, PROSE_TOKEN_FILE, PROSE_TOKEN_FILE_MAX_BYTES, PROSE_TOKEN_VALUE_MAX_LENGTH, type ParsedProseTokenFile, type ProsePolarity, type ProseTokenBlocks, type ProseTokenProbe, type ResolvedTokenFile, affectsTokenLookup, dirOfFile, parseProseTokenFile, resolveTokenFile, tokensFor };
