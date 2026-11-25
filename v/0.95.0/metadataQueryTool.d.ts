import { Metadata, FilesMetadata } from './sandboxTypes.js';

/** The tool's canonical name — `metadata:query`, catalog-shaped. */
declare const METADATA_QUERY_TOOL_NAME = "metadata:query";
/** One heading of an indexed entry — the additive index extension (GROVE_AGENT_SPEC
 * §4: `headings: [{id, text, depth}]`, ids from the mdx-plugins heading-anchor canon). */
interface HeadingSummary {
    id: string;
    text: string;
    /** 1–6, the ATX depth. */
    depth: number;
}
/** The declarative filter set — the tool's whole argument vocabulary. */
interface MetadataQueryInput {
    /** Glob over the row's path RELATIVE to the chroot root (`*` within one segment,
     * `**` across segments). Default: every row. */
    pathGlob?: string;
    /** Frontmatter filters, ANDed together. */
    where?: Array<{
        /** Dotted own-property path into the row's frontmatter (one nesting level is
         * representable in frontmatter; deeper paths simply never match). */
        key: string;
        op: 'eq' | 'contains' | 'in' | 'exists';
        /** For `eq`: a scalar. For `in`: an array of scalars. Unused by `exists`. */
        value?: unknown;
    }>;
    /** Dotted frontmatter key to sort by (rows lacking it sort last, stably). */
    sortBy?: string;
    /** Default `'asc'`. */
    order?: 'asc' | 'desc';
    /** Cap on returned rows (default 100, max 500 — the cheap call stays cheap). */
    limit?: number;
    /** Frontmatter fields to include per row (dotted). Default: the whole record. */
    select?: string[];
}
/** One query result row: the path (chroot-relative), the selected frontmatter (or
 * all of it), and the entry's headings when the index carries them. */
interface MetadataQueryRow {
    path: string;
    meta: Metadata;
    headings?: HeadingSummary[];
}
/** Canonical, catalog-shaped descriptor for the tool — the same definition every
 * consumer reads (the app's loop, the MCP bridge, a future external executor), so
 * there is exactly one `metadata:query` in the world. */
declare const METADATA_QUERY_TOOL_DESCRIPTOR: {
    readonly name: "metadata:query";
    readonly description: string;
    readonly paramsSchema: {
        readonly type: "object";
        readonly additionalProperties: false;
        readonly properties: {
            readonly pathGlob: {
                readonly type: "string";
                readonly description: "Glob over the entry path relative to the corpus root (`*` one segment, `**` any).";
            };
            readonly where: {
                readonly type: "array";
                readonly items: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly required: readonly ["key", "op"];
                    readonly properties: {
                        readonly key: {
                            readonly type: "string";
                            readonly description: "Dotted frontmatter field path.";
                        };
                        readonly op: {
                            readonly type: "string";
                            readonly enum: readonly ["eq", "contains", "in", "exists"];
                        };
                        readonly value: {
                            readonly description: "Scalar for `eq`; array of scalars for `in`; unused by `exists`.";
                            readonly anyOf: readonly [{
                                readonly type: readonly ["string", "number", "boolean", "null"];
                            }, {
                                readonly type: "array";
                                readonly items: {
                                    readonly type: readonly ["string", "number", "boolean", "null"];
                                };
                            }];
                        };
                    };
                };
            };
            readonly sortBy: {
                readonly type: "string";
            };
            readonly order: {
                readonly type: "string";
                readonly enum: readonly ["asc", "desc"];
            };
            readonly limit: {
                readonly type: "integer";
                readonly minimum: 1;
                readonly maximum: 500;
            };
            readonly select: {
                readonly type: "array";
                readonly items: {
                    readonly type: "string";
                };
            };
        };
    };
};
/** A validation failure — the boundary's only error shape (`invalid-params`, the
 * platform's typed-error vocabulary). */
declare class MetadataQueryError extends Error {
    code: "invalid-params";
}
/** `*` within a segment, `**` across segments — the whole vocabulary. Compiled once
 * per query; anchored so `a/b` never matches `x/a/b`. */
declare function globToRegExp(glob: string): RegExp;
/**
 * Run a metadata query over an index — PURE (G-GA-4: it cannot read a file body).
 *
 * @param index  the in-scope metadata store (`useAllMetadata()` / a scan result),
 *               keyed by absolute path.
 * @param chroot the corpus root rows are confined to (G-GA-11): the SAME root the
 *               app's `read_entry` chroots to, so the two tools describe one corpus.
 * @param raw    the model-supplied arguments, validated here at the boundary.
 * @param filter optional app row-policy (e.g. excluding `_`-prefixed structural
 *               files) applied after the chroot filter.
 * @throws {MetadataQueryError} (`code: 'invalid-params'`) on any non-declarative or
 *         proto-polluting argument.
 */
declare function runMetadataQuery(index: FilesMetadata, chroot: string, raw: unknown, filter?: (absPath: string) => boolean): MetadataQueryRow[];
/** The `headings` index field rides the row itself; `runMetadataQuery` hoists it out
 * of `meta`. Exported so scans (which BUILD rows) and queries (which read them) agree
 * on the key. */
declare const METADATA_HEADINGS_KEY = "headings";
/** Execute the tool for an agent loop: validate, query, and return the fenced result
 * (index rows are corpus-derived bytes — R-GA-7 fences them where they enter the
 * loop). Errors come back as `isError` results, never thrown, so the model adapts. */
declare function executeMetadataQuery(index: FilesMetadata, chroot: string, raw: unknown, filter?: (absPath: string) => boolean): {
    content: string;
    isError?: boolean;
};
/** A loop-ready tool over an index the app supplies per call (the metadata store can
 * be rescanned; the executor reads through the getter, so it never goes stale). */
declare function createMetadataQueryTool(options: {
    /** Absolute corpus root — rows outside it are invisible (G-GA-11). */
    chroot: string;
    /** The index to query (e.g. `useAllMetadata()` at call time, or a scan result). */
    getIndex: () => FilesMetadata;
    /** App row-policy after the chroot filter (e.g. no `_`-prefixed files). */
    filter?: (absPath: string) => boolean;
}): {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    execute: (raw: unknown) => {
        content: string;
        isError?: boolean;
    };
};

export { type HeadingSummary, METADATA_HEADINGS_KEY, METADATA_QUERY_TOOL_DESCRIPTOR, METADATA_QUERY_TOOL_NAME, MetadataQueryError, type MetadataQueryInput, type MetadataQueryRow, createMetadataQueryTool, executeMetadataQuery, globToRegExp, runMetadataQuery };
