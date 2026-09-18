import { RouteParams } from './RoutingSpec.js';
import 'react';

/**
 * Compile a path template to an anchored RegExp with named groups:
 *   `:name` → one non-slash segment   `*` → the rest (greedy)
 * A template with neither token is a literal exact match. Raw RegExp patterns
 * never reach here — they are the escape hatch, used as authored.
 */
declare const compileTemplate: (template: string) => RegExp;
/** Resolve a pattern to a RegExp: templates are compiled (and cached), RegExp passes through. */
declare const toRegExp: (pattern: string | RegExp) => RegExp;
/**
 * Match a `sandboxPath` against a route pattern. Returns the named params on a
 * match (the `*` wildcard surfaces under the `'*'` key), or `null` otherwise.
 */
declare const matchRoute: (pattern: string | RegExp, path: string) => RouteParams | null;

export { compileTemplate, matchRoute, toRegExp };
