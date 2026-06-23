import type { RouteParams } from './RoutingSpec';

// from: https://stackoverflow.com/a/63838890
const escapeForRegexp = (str: string): string => str.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&');

// Internal group name standing in for a `*` wildcard (which is not a valid JS
// regex group identifier); remapped to the `*` param key after matching.
const WILDCARD_GROUP = 'wild';

/**
 * Compile a path template to an anchored RegExp with named groups:
 *   `:name` → one non-slash segment   `*` → the rest (greedy)
 * A template with neither token is a literal exact match. Raw RegExp patterns
 * never reach here — they are the escape hatch, used as authored.
 */
export const compileTemplate = (template: string): RegExp => {
  const token = /(:[A-Za-z_][A-Za-z0-9_]*)|\*/g;
  let src = '';
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = token.exec(template)) !== null) {
    src += escapeForRegexp(template.slice(last, m.index));
    src += m[1] ? `(?<${m[1].slice(1)}>[^/]+)` : `(?<${WILDCARD_GROUP}>.*)`;
    last = m.index + m[0].length;
  }
  src += escapeForRegexp(template.slice(last));
  return new RegExp(`^${src}$`);
};

const templateCache = new Map<string, RegExp>();

/** Resolve a pattern to a RegExp: templates are compiled (and cached), RegExp passes through. */
export const toRegExp = (pattern: string | RegExp): RegExp => {
  if (pattern instanceof RegExp) {
    return pattern;
  }
  let compiled = templateCache.get(pattern);
  if (!compiled) {
    compiled = compileTemplate(pattern);
    templateCache.set(pattern, compiled);
  }
  return compiled;
};

/**
 * Match a `sandboxPath` against a route pattern. Returns the named params on a
 * match (the `*` wildcard surfaces under the `'*'` key), or `null` otherwise.
 */
export const matchRoute = (pattern: string | RegExp, path: string): RouteParams | null => {
  const match = path.match(toRegExp(pattern));
  if (!match) {
    return null;
  }
  const params: RouteParams = {};
  for (const [key, value] of Object.entries(match.groups ?? {})) {
    if (value !== undefined) {
      params[key === WILDCARD_GROUP ? '*' : key] = value;
    }
  }
  return params;
};
