// The MDX metadata query tool (GROVE_AGENT_SPEC §4) — the agent-facing form of the
// frontmatter index the platform already builds (`filesMetadata`).
//
// An embedded agent answers "which entries are tagged `security` and updated since
// June" in ONE call against an in-sandbox index instead of N `read_entry` round-trips
// over every file. SDK-LOCAL execution: a projection of the index the app already
// holds — no host round-trip, no new authority. Results are INDEX ROWS (path +
// frontmatter subset + the entry's heading list), never file bodies: the cheap call
// stays cheap, and the read that taints is the explicit one (`read_entry`).
//
// SECURITY SHAPE (G-GA-3/G-GA-4/G-GA-11):
//   • Declarative filters, never expressions — the arguments are DATA, validated at
//     this boundary. Model-supplied arguments are untrusted input; a predicate DSL
//     would be an interpreter fed by it (the BUNDLE_EMBEDDING §4.1 rejection,
//     restated for tools: dotted own-property paths, `__proto__`/`constructor`/
//     `prototype` segments rejected).
//   • Execution is pure over the index — it cannot open a file body even by accident.
//   • Rows are confined to a caller-supplied chroot: the raw index can span more than
//     the corpus mount, and no row whose body the read tool cannot legally open may
//     be returned.
//
// TAINT (GROVE_AGENT_SPEC §4, "the enforceable statement"): taint attaches where the
// host can see — at the mount reads that BUILD the index — not at this query. An
// external consumer executing the canonical descriptor must route through a
// host-visible read of the backing mount, never a copy of this in-sandbox structure.

import type { FilesMetadata, Metadata } from './sandboxTypes';
import { fenceUntrusted } from './fence';

/** The tool's canonical name — `metadata:query`, catalog-shaped. */
export const METADATA_QUERY_TOOL_NAME = 'metadata:query';

/** One heading of an indexed entry — the additive index extension (GROVE_AGENT_SPEC
 * §4: `headings: [{id, text, depth}]`, ids from the mdx-plugins heading-anchor canon). */
export interface HeadingSummary {
  id: string;
  text: string;
  /** 1–6, the ATX depth. */
  depth: number;
}

/** The declarative filter set — the tool's whole argument vocabulary. */
export interface MetadataQueryInput {
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
export interface MetadataQueryRow {
  path: string;
  meta: Metadata;
  headings?: HeadingSummary[];
}

/** Canonical, catalog-shaped descriptor for the tool — the same definition every
 * consumer reads (the app's loop, the MCP bridge, a future external executor), so
 * there is exactly one `metadata:query` in the world. */
export const METADATA_QUERY_TOOL_DESCRIPTOR = {
  name: METADATA_QUERY_TOOL_NAME,
  description:
    'Query the MDX corpus index: paths, frontmatter, and headings of entries. ' +
    'Declarative filters only (no expressions). Returns index rows — never file bodies.',
  paramsSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      pathGlob: {
        type: 'string',
        description: 'Glob over the entry path relative to the corpus root (`*` one segment, `**` any).',
      },
      where: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['key', 'op'],
          properties: {
            key: { type: 'string', description: 'Dotted frontmatter field path.' },
            op: { type: 'string', enum: ['eq', 'contains', 'in', 'exists'] },
            value: {
              description: 'Scalar for `eq`; array of scalars for `in`; unused by `exists`.',
              anyOf: [
                { type: ['string', 'number', 'boolean', 'null'] },
                { type: 'array', items: { type: ['string', 'number', 'boolean', 'null'] } },
              ],
            },
          },
        },
      },
      sortBy: { type: 'string' },
      order: { type: 'string', enum: ['asc', 'desc'] },
      limit: { type: 'integer', minimum: 1, maximum: 500 },
      select: { type: 'array', items: { type: 'string' } },
    },
  },
} as const;

/** A validation failure — the boundary's only error shape (`invalid-params`, the
 * platform's typed-error vocabulary). */
export class MetadataQueryError extends Error {
  code = 'invalid-params' as const;
}

// ── boundary validation ────────────────────────────────────────────────────────

const RESERVED_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);
const SCALAR = new Set(['string', 'number', 'boolean']);

/** BUNDLE_EMBEDDING §4.1 hygiene: a dotted path is own-property segments only, and
 * no segment may be `__proto__`/`constructor`/`prototype`. Rejecting the segment
 * names (rather than trusting `hasOwn` alone) is belt-and-braces: it keeps the
 * attack string out of the traversal entirely, the same way the projection parser
 * does. */
function validateDottedKey(key: unknown, what: string): string {
  if (typeof key !== 'string' || !key) throw new MetadataQueryError(`${what} must be a non-empty string`);
  if (key.length > 128) throw new MetadataQueryError(`${what} is too long (max 128 chars)`);
  if (/[/\\\u0000-\u001f]/.test(key))
    throw new MetadataQueryError(`${what} must be a dotted path (no path separators)`);
  for (const seg of key.split('.')) {
    if (!seg) throw new MetadataQueryError(`${what} has an empty segment: ${JSON.stringify(key)}`);
    if (RESERVED_SEGMENTS.has(seg)) throw new MetadataQueryError(`${what} contains a reserved segment: ${seg}`);
  }
  return key;
}

function validateInput(raw: unknown): MetadataQueryInput {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new MetadataQueryError('input must be an object');
  }
  const src = raw as Record<string, unknown>;
  for (const k of Object.keys(src)) {
    if (!['pathGlob', 'where', 'sortBy', 'order', 'limit', 'select'].includes(k)) {
      throw new MetadataQueryError(`unknown argument: ${k}`);
    }
  }
  const out: MetadataQueryInput = {};
  if (src.pathGlob !== undefined) {
    if (typeof src.pathGlob !== 'string' || !src.pathGlob || src.pathGlob.length > 256) {
      throw new MetadataQueryError('pathGlob must be a non-empty string (≤256 chars)');
    }
    if (/[\u0000\n\r]/.test(src.pathGlob)) throw new MetadataQueryError('pathGlob contains control characters');
    out.pathGlob = src.pathGlob;
  }
  if (src.where !== undefined) {
    if (!Array.isArray(src.where) || src.where.length > 32) {
      throw new MetadataQueryError('where must be an array of at most 32 filters');
    }
    out.where = src.where.map((w, i) => {
      if (typeof w !== 'object' || w === null || Array.isArray(w)) {
        throw new MetadataQueryError(`where[${i}] must be an object`);
      }
      const { key, op, value } = w as Record<string, unknown>;
      validateDottedKey(key, `where[${i}].key`);
      if (op !== 'eq' && op !== 'contains' && op !== 'in' && op !== 'exists') {
        throw new MetadataQueryError(`where[${i}].op must be eq|contains|in|exists`);
      }
      if (value !== undefined) {
        if (typeof value === 'function') {
          throw new MetadataQueryError(`where[${i}].value must be data, not a function`);
        }
        if (op === 'in') {
          if (!Array.isArray(value) || value.length > 100 || value.some((v) => !SCALAR.has(typeof v) && v !== null)) {
            throw new MetadataQueryError(`where[${i}].value for op=in must be an array of scalars`);
          }
        } else if (!SCALAR.has(typeof value) && value !== null) {
          if (typeof value === 'object')
            throw new MetadataQueryError(`where[${i}].value for op=${op} must be a scalar`);
          throw new MetadataQueryError(`where[${i}].value for op=${op} must be a scalar`);
        }
      } else if (op !== 'exists') {
        throw new MetadataQueryError(`where[${i}].value is required for op=${op}`);
      }
      return { key: key as string, op, ...(value !== undefined ? { value } : {}) };
    });
  }
  if (src.sortBy !== undefined) out.sortBy = validateDottedKey(src.sortBy, 'sortBy');
  if (src.order !== undefined) {
    if (src.order !== 'asc' && src.order !== 'desc') throw new MetadataQueryError('order must be asc|desc');
    out.order = src.order;
  }
  if (src.limit !== undefined) {
    if (typeof src.limit !== 'number' || !Number.isInteger(src.limit) || src.limit < 1 || src.limit > 500) {
      throw new MetadataQueryError('limit must be an integer 1–500');
    }
    out.limit = src.limit;
  }
  if (src.select !== undefined) {
    if (!Array.isArray(src.select) || src.select.length > 64) {
      throw new MetadataQueryError('select must be an array of at most 64 field paths');
    }
    out.select = src.select.map((k, i) => validateDottedKey(k, `select[${i}]`));
  }
  return out;
}

// ── evaluation (pure) ──────────────────────────────────────────────────────────

/** Resolve a validated dotted key over a frontmatter record by own properties only.
 * `undefined` at any hop means "absent" (never a match, never a prototype value). */
function resolveOwn(meta: Metadata, key: string): unknown {
  let cur: unknown = meta;
  for (const seg of key.split('.')) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = Object.prototype.hasOwnProperty.call(cur, seg) ? (cur as Record<string, unknown>)[seg] : undefined;
    if (cur === undefined) return undefined;
  }
  return cur;
}

/** `*` within a segment, `**` across segments — the whole vocabulary. Compiled once
 * per query; anchored so `a/b` never matches `x/a/b`. */
export function globToRegExp(glob: string): RegExp {
  const esc = glob.replace(/[.+^${}()|[\]\\?]/g, '\\$&');
  const re = esc
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*');
  return new RegExp(`^${re}$`);
}

function matches(row: Metadata, w: { key: string; op: string; value?: unknown }): boolean {
  const v = resolveOwn(row, w.key);
  switch (w.op) {
    case 'exists':
      return v !== undefined;
    case 'eq':
      return v === w.value || (v === null && w.value === null);
    case 'contains': {
      const needle = w.value;
      if (typeof needle !== 'string') return false;
      if (typeof v === 'string') return v.includes(needle);
      if (Array.isArray(v)) return v.some((x) => typeof x === 'string' && x.includes(needle));
      return false;
    }
    case 'in': {
      if (!Array.isArray(w.value)) return false;
      return w.value.some((needle) => v === needle);
    }
    default:
      return false;
  }
}

function compare(a: unknown, b: unknown): number {
  // Scalars only (the boundary guarantees it for `value`; sortBy paths resolve to
  // whatever frontmatter carries — non-scalars compare as their string form, last).
  const rank = (v: unknown): number => (v === undefined ? 0 : 1);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (a === undefined) return 0;
  const as = typeof a === 'number' && typeof b === 'number' ? a : String(a);
  const bs = typeof a === 'number' && typeof b === 'number' ? b : String(b);
  return as < bs ? -1 : as > bs ? 1 : 0;
}

/** Normalize a chroot prefix to `starts-with` form: absolute, trailing slash. */
function normalizeChroot(chroot: string): string {
  const c = chroot.startsWith('/') ? chroot : `/${chroot}`;
  return c.endsWith('/') ? c : `${c}/`;
}

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
export function runMetadataQuery(
  index: FilesMetadata,
  chroot: string,
  raw: unknown,
  filter?: (absPath: string) => boolean,
): MetadataQueryRow[] {
  const input = validateInput(raw);
  const root = normalizeChroot(chroot);
  const globRe = input.pathGlob !== undefined ? globToRegExp(input.pathGlob) : null;

  const rows: Array<{ rel: string; meta: Metadata; headings?: HeadingSummary[] }> = [];
  for (const [abs, rowMeta] of Object.entries(index)) {
    if (!abs.startsWith(root)) continue; // G-GA-11 — the chroot is the corpus
    if (filter && !filter(abs)) continue;
    const rel = abs.slice(root.length);
    if (globRe && !globRe.test(rel)) continue;
    const { headings, ...frontmatter } = rowMeta as Metadata & { headings?: HeadingSummary[] };
    const meta = frontmatter as Metadata;
    if (input.where && !input.where.every((w) => matches(meta, w))) continue;
    rows.push({ rel, meta, headings: Array.isArray(headings) ? headings : undefined });
  }

  if (input.sortBy) {
    const dir = input.order === 'desc' ? -1 : 1;
    rows.sort(
      (x, y) => dir * compare(resolveOwn(x.meta, input.sortBy as string), resolveOwn(y.meta, input.sortBy as string)),
    );
  }

  const limit = input.limit ?? 100;
  const sliced = rows.slice(0, limit);
  return sliced.map(({ rel, meta, headings }) => {
    let out: Metadata = meta;
    if (input.select) {
      out = {};
      for (const key of input.select) {
        const v = resolveOwn(meta, key);
        if (v !== undefined) out[key] = v as never;
      }
    }
    return { path: rel, meta: out, ...(headings ? { headings } : {}) };
  });
}

/** The `headings` index field rides the row itself; `runMetadataQuery` hoists it out
 * of `meta`. Exported so scans (which BUILD rows) and queries (which read them) agree
 * on the key. */
export const METADATA_HEADINGS_KEY = 'headings';

/** Execute the tool for an agent loop: validate, query, and return the fenced result
 * (index rows are corpus-derived bytes — R-GA-7 fences them where they enter the
 * loop). Errors come back as `isError` results, never thrown, so the model adapts. */
export function executeMetadataQuery(
  index: FilesMetadata,
  chroot: string,
  raw: unknown,
  filter?: (absPath: string) => boolean,
): { content: string; isError?: boolean } {
  try {
    const rows = runMetadataQuery(index, chroot, raw, filter);
    return { content: fenceUntrusted('tool-result: metadata rows', JSON.stringify(rows, null, 2)) };
  } catch (e) {
    const code = (e as { code?: string })?.code ?? 'invalid-params';
    return { content: `${code}: ${(e as Error).message}`, isError: true };
  }
}

/** A loop-ready tool over an index the app supplies per call (the metadata store can
 * be rescanned; the executor reads through the getter, so it never goes stale). */
export function createMetadataQueryTool(options: {
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
  execute: (raw: unknown) => { content: string; isError?: boolean };
} {
  const d = METADATA_QUERY_TOOL_DESCRIPTOR;
  return {
    name: d.name,
    description: d.description,
    inputSchema: d.paramsSchema as Record<string, unknown>,
    execute: (raw: unknown) => executeMetadataQuery(options.getIndex(), options.chroot, raw, options.filter),
  };
}
