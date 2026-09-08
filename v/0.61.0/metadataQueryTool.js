import "./chunk-VHAA22YE.js";
import { fenceUntrusted } from "./fence";
const METADATA_QUERY_TOOL_NAME = "metadata:query";
const METADATA_QUERY_TOOL_DESCRIPTOR = {
  name: METADATA_QUERY_TOOL_NAME,
  description: "Query the MDX corpus index: paths, frontmatter, and headings of entries. Declarative filters only (no expressions). Returns index rows \u2014 never file bodies.",
  paramsSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      pathGlob: {
        type: "string",
        description: "Glob over the entry path relative to the corpus root (`*` one segment, `**` any)."
      },
      where: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["key", "op"],
          properties: {
            key: { type: "string", description: "Dotted frontmatter field path." },
            op: { type: "string", enum: ["eq", "contains", "in", "exists"] },
            value: {
              description: "Scalar for `eq`; array of scalars for `in`; unused by `exists`.",
              anyOf: [
                { type: ["string", "number", "boolean", "null"] },
                { type: "array", items: { type: ["string", "number", "boolean", "null"] } }
              ]
            }
          }
        }
      },
      sortBy: { type: "string" },
      order: { type: "string", enum: ["asc", "desc"] },
      limit: { type: "integer", minimum: 1, maximum: 500 },
      select: { type: "array", items: { type: "string" } }
    }
  }
};
class MetadataQueryError extends Error {
  constructor() {
    super(...arguments);
    this.code = "invalid-params";
  }
}
const RESERVED_SEGMENTS = /* @__PURE__ */ new Set(["__proto__", "constructor", "prototype"]);
const SCALAR = /* @__PURE__ */ new Set(["string", "number", "boolean"]);
function validateDottedKey(key, what) {
  if (typeof key !== "string" || !key) throw new MetadataQueryError(`${what} must be a non-empty string`);
  if (key.length > 128) throw new MetadataQueryError(`${what} is too long (max 128 chars)`);
  if (/[/\\\u0000-\u001f]/.test(key))
    throw new MetadataQueryError(`${what} must be a dotted path (no path separators)`);
  for (const seg of key.split(".")) {
    if (!seg) throw new MetadataQueryError(`${what} has an empty segment: ${JSON.stringify(key)}`);
    if (RESERVED_SEGMENTS.has(seg)) throw new MetadataQueryError(`${what} contains a reserved segment: ${seg}`);
  }
  return key;
}
function validateInput(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new MetadataQueryError("input must be an object");
  }
  const src = raw;
  for (const k of Object.keys(src)) {
    if (!["pathGlob", "where", "sortBy", "order", "limit", "select"].includes(k)) {
      throw new MetadataQueryError(`unknown argument: ${k}`);
    }
  }
  const out = {};
  if (src.pathGlob !== void 0) {
    if (typeof src.pathGlob !== "string" || !src.pathGlob || src.pathGlob.length > 256) {
      throw new MetadataQueryError("pathGlob must be a non-empty string (\u2264256 chars)");
    }
    if (/[\u0000\n\r]/.test(src.pathGlob)) throw new MetadataQueryError("pathGlob contains control characters");
    out.pathGlob = src.pathGlob;
  }
  if (src.where !== void 0) {
    if (!Array.isArray(src.where) || src.where.length > 32) {
      throw new MetadataQueryError("where must be an array of at most 32 filters");
    }
    out.where = src.where.map((w, i) => {
      if (typeof w !== "object" || w === null || Array.isArray(w)) {
        throw new MetadataQueryError(`where[${i}] must be an object`);
      }
      const { key, op, value } = w;
      validateDottedKey(key, `where[${i}].key`);
      if (op !== "eq" && op !== "contains" && op !== "in" && op !== "exists") {
        throw new MetadataQueryError(`where[${i}].op must be eq|contains|in|exists`);
      }
      if (value !== void 0) {
        if (typeof value === "function") {
          throw new MetadataQueryError(`where[${i}].value must be data, not a function`);
        }
        if (op === "in") {
          if (!Array.isArray(value) || value.length > 100 || value.some((v) => !SCALAR.has(typeof v) && v !== null)) {
            throw new MetadataQueryError(`where[${i}].value for op=in must be an array of scalars`);
          }
        } else if (!SCALAR.has(typeof value) && value !== null) {
          if (typeof value === "object")
            throw new MetadataQueryError(`where[${i}].value for op=${op} must be a scalar`);
          throw new MetadataQueryError(`where[${i}].value for op=${op} must be a scalar`);
        }
      } else if (op !== "exists") {
        throw new MetadataQueryError(`where[${i}].value is required for op=${op}`);
      }
      return { key, op, ...value !== void 0 ? { value } : {} };
    });
  }
  if (src.sortBy !== void 0) out.sortBy = validateDottedKey(src.sortBy, "sortBy");
  if (src.order !== void 0) {
    if (src.order !== "asc" && src.order !== "desc") throw new MetadataQueryError("order must be asc|desc");
    out.order = src.order;
  }
  if (src.limit !== void 0) {
    if (typeof src.limit !== "number" || !Number.isInteger(src.limit) || src.limit < 1 || src.limit > 500) {
      throw new MetadataQueryError("limit must be an integer 1\u2013500");
    }
    out.limit = src.limit;
  }
  if (src.select !== void 0) {
    if (!Array.isArray(src.select) || src.select.length > 64) {
      throw new MetadataQueryError("select must be an array of at most 64 field paths");
    }
    out.select = src.select.map((k, i) => validateDottedKey(k, `select[${i}]`));
  }
  return out;
}
function resolveOwn(meta, key) {
  let cur = meta;
  for (const seg of key.split(".")) {
    if (typeof cur !== "object" || cur === null) return void 0;
    cur = Object.prototype.hasOwnProperty.call(cur, seg) ? cur[seg] : void 0;
    if (cur === void 0) return void 0;
  }
  return cur;
}
function globToRegExp(glob) {
  const esc = glob.replace(/[.+^${}()|[\]\\?]/g, "\\$&");
  const re = esc.replace(/\*\*/g, "\0").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*");
  return new RegExp(`^${re}$`);
}
function matches(row, w) {
  const v = resolveOwn(row, w.key);
  switch (w.op) {
    case "exists":
      return v !== void 0;
    case "eq":
      return v === w.value || v === null && w.value === null;
    case "contains": {
      const needle = w.value;
      if (typeof needle !== "string") return false;
      if (typeof v === "string") return v.includes(needle);
      if (Array.isArray(v)) return v.some((x) => typeof x === "string" && x.includes(needle));
      return false;
    }
    case "in": {
      if (!Array.isArray(w.value)) return false;
      return w.value.some((needle) => v === needle);
    }
    default:
      return false;
  }
}
function compare(a, b) {
  const rank = (v) => v === void 0 ? 0 : 1;
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (a === void 0) return 0;
  const as = typeof a === "number" && typeof b === "number" ? a : String(a);
  const bs = typeof a === "number" && typeof b === "number" ? b : String(b);
  return as < bs ? -1 : as > bs ? 1 : 0;
}
function normalizeChroot(chroot) {
  const c = chroot.startsWith("/") ? chroot : `/${chroot}`;
  return c.endsWith("/") ? c : `${c}/`;
}
function runMetadataQuery(index, chroot, raw, filter) {
  const input = validateInput(raw);
  const root = normalizeChroot(chroot);
  const globRe = input.pathGlob !== void 0 ? globToRegExp(input.pathGlob) : null;
  const rows = [];
  for (const [abs, rowMeta] of Object.entries(index)) {
    if (!abs.startsWith(root)) continue;
    if (filter && !filter(abs)) continue;
    const rel = abs.slice(root.length);
    if (globRe && !globRe.test(rel)) continue;
    const { headings, ...frontmatter } = rowMeta;
    const meta = frontmatter;
    if (input.where && !input.where.every((w) => matches(meta, w))) continue;
    rows.push({ rel, meta, headings: Array.isArray(headings) ? headings : void 0 });
  }
  if (input.sortBy) {
    const dir = input.order === "desc" ? -1 : 1;
    rows.sort(
      (x, y) => dir * compare(resolveOwn(x.meta, input.sortBy), resolveOwn(y.meta, input.sortBy))
    );
  }
  const limit = input.limit ?? 100;
  const sliced = rows.slice(0, limit);
  return sliced.map(({ rel, meta, headings }) => {
    let out = meta;
    if (input.select) {
      out = {};
      for (const key of input.select) {
        const v = resolveOwn(meta, key);
        if (v !== void 0) out[key] = v;
      }
    }
    return { path: rel, meta: out, ...headings ? { headings } : {} };
  });
}
const METADATA_HEADINGS_KEY = "headings";
function executeMetadataQuery(index, chroot, raw, filter) {
  try {
    const rows = runMetadataQuery(index, chroot, raw, filter);
    return { content: fenceUntrusted("tool-result: metadata rows", JSON.stringify(rows, null, 2)) };
  } catch (e) {
    const code = e?.code ?? "invalid-params";
    return { content: `${code}: ${e.message}`, isError: true };
  }
}
function createMetadataQueryTool(options) {
  const d = METADATA_QUERY_TOOL_DESCRIPTOR;
  return {
    name: d.name,
    description: d.description,
    inputSchema: d.paramsSchema,
    execute: (raw) => executeMetadataQuery(options.getIndex(), options.chroot, raw, options.filter)
  };
}
export {
  METADATA_HEADINGS_KEY,
  METADATA_QUERY_TOOL_DESCRIPTOR,
  METADATA_QUERY_TOOL_NAME,
  MetadataQueryError,
  createMetadataQueryTool,
  executeMetadataQuery,
  globToRegExp,
  runMetadataQuery
};
//# sourceMappingURL=metadataQueryTool.js.map