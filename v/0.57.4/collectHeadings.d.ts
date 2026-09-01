import { HeadingSummary } from './metadataQueryTool.js';
import './sandboxTypes.js';

/**
 * Collect an entry's headings from its MDX/Markdown BODY (frontmatter already
 * stripped — `parseFrontmatter(...).body`).
 *
 * Inline markup is flattened the way the remark pass flattens it (`## The **bold**
 * heading` → "The bold heading"), code fences are skipped, and ids follow the canon
 * with per-document duplicate suffixes.
 */
declare function collectHeadings(body: string, opts?: {
    sectionIds?: boolean;
}): HeadingSummary[];

export { HeadingSummary, collectHeadings };
