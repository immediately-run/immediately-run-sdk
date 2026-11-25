import { ProseTokenBlocks } from './proseTokens.js';

/**
 * The author token values for a routed Markdown file (repo-relative path), or `null` while
 * none apply or before the first read settles — the page renders with the defaults
 * meanwhile and is never suspended on the token file. `undefined` reads nothing.
 */
declare function useProseTokens(filename: string | undefined): ProseTokenBlocks | null;

export { useProseTokens };
