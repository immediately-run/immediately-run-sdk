/*
 * Structural extraction of a built `.d.ts` public surface — the SHAPE of every
 * export, not just its name (R3-261).
 *
 * `check-api-stability.mjs` used to answer "which names does this module export?"
 * with a regex. That guards a *removed export*, but an exported interface keeps
 * its name while losing a field, and a function keeps its name while losing a
 * parameter — both break a pinned fork at compile time exactly as a removed
 * export does (SDK_PACKAGING_SPEC §9, UI_AS_APPS §0/§7, core value #4), and both
 * were invisible to the gate.
 *
 * This module answers "what SHAPE does this module export?" using the TypeScript
 * compiler API, generalising the extractor prototyped in
 * `scripts/codegen-prototype/verify.types.mjs` (sdk #84) — which already knew the
 * fiddly part: tsup emits BOTH export styles, inline `export interface X` in some
 * files and `declare interface X` + a trailing `export { type X, … }` list in
 * others.
 *
 * ── The shape vocabulary ──────────────────────────────────────────────────────
 * Every export collapses to ONE short string, because the snapshot's diff has to
 * stay readable — an API change must show up as a line a reviewer actually reads,
 * not a wall of JSON that gets rubber-stamped (R3-261's stated main design risk).
 *
 *   interface(a, b?, c(1..2))   members, sorted; `?` = optional; `(req..tot)` on
 *                               a member whose type is callable (its arity)
 *   object(a, b?)               a type alias whose right-hand side is a type literal
 *   union(a|b|c)                a type alias whose right-hand side is a union
 *                               (member texts, normalised + sorted)
 *   enum(A, B)                  enum members, sorted
 *   class(a, b?)                class members, sorted (public surface)
 *   fn(req..tot)                a function/const-of-function: REQUIRED..TOTAL arity
 *   const(<type>)               a non-callable const/let/var, with its type text
 *   alias(<type>)               any other type alias, with its normalised type text
 *   namespace                   a namespace (opaque; its members are not public API
 *                               through this surface)
 *
 * Members are SORTED, so reordering a declaration — which breaks nobody — is not
 * reported as a change. Parameter NAMES are deliberately not recorded (renaming a
 * parameter is not a breaking change); its arity is, split required..total so that
 * making a required parameter optional (widening, fine) reads differently from
 * dropping one (breaking).
 *
 * ── Deliberate limit ──────────────────────────────────────────────────────────
 * Member and parameter TYPES are not compared (except for the short type text of
 * a plain alias/const). Tightening `string` to `'a' | 'b'` therefore still passes.
 * That is the legibility trade: recording every member's printed type turns the
 * snapshot into the unreadable wall this format exists to avoid. The four breaks
 * R3-261 names — dropped field, flipped optionality, dropped union member, dropped
 * parameter — are all caught.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve, relative } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const norm = (s) => s.replace(/\s+/g, ' ').trim();

/** `required..total` for a parameter list. Split so that making a required
 *  parameter optional (widening — fine) reads differently from dropping one
 *  (breaking). A rest parameter counts toward the total, never the required. */
const paramArity = (params = []) => {
  const required = params.filter((p) => !p.questionToken && !p.dotDotDotToken && !p.initializer).length;
  return `${required}..${params.length}`;
};

/** `(required..total)` for anything callable; `null` when the node isn't. */
const arityOf = (node) => {
  if (!node) return null;
  if (ts.isFunctionTypeNode(node) || ts.isArrowFunction(node) || ts.isFunctionDeclaration(node)) {
    return paramArity(node.parameters);
  }
  return null;
};

/** One interface/class/type-literal member, as `name`, `name?`, or `name(0..2)`. */
const memberOf = (m, src) => {
  if (ts.isIndexSignatureDeclaration(m)) return '[index]';
  if (ts.isCallSignatureDeclaration(m) || ts.isConstructSignatureDeclaration(m)) {
    const kw = ts.isCallSignatureDeclaration(m) ? 'call' : 'new';
    return `${kw}(${paramArity(m.parameters)})`;
  }
  if (!m.name) return null;
  const name = m.name.getText(src);
  const optional = m.questionToken !== undefined ? '?' : '';
  let arity = null;
  if (ts.isMethodSignature(m) || ts.isMethodDeclaration(m)) {
    arity = paramArity(m.parameters);
  } else if (m.type) {
    arity = arityOf(m.type);
  }
  return `${name}${optional}${arity ? `(${arity})` : ''}`;
};

const membersOf = (nodes, src) => [...new Set(nodes.map((m) => memberOf(m, src)).filter(Boolean))].sort();

/**
 * Collapse a TYPE node to its shape text.
 *
 * The recursion exists for legibility, not completeness: an inline object literal
 * printed verbatim is what turns a snapshot into a wall of JSON (the `WIRE_NAMES`
 * const prints at 2.6 KB on one line), so a type literal anywhere — a const's
 * type, a union arm, an array element — collapses to its KEY NAMES. Everything
 * unrecognised falls back to its normalised source text, which for the shapes the
 * SDK actually exports is short (`string`, `Record<string, unknown>`, `Promise<T>`).
 */
const typeShape = (node, src) => {
  if (!node) return 'unknown';
  if (ts.isParenthesizedTypeNode(node)) return typeShape(node.type, src);
  if (ts.isTypeLiteralNode(node)) return `{${membersOf(node.members, src).join(', ')}}`;
  if (ts.isUnionTypeNode(node)) {
    return [...new Set(node.types.map((t) => typeShape(t, src)))].sort().join('|');
  }
  if (ts.isFunctionTypeNode(node)) return `fn(${paramArity(node.parameters)})`;
  if (ts.isTypeOperatorNode(node) && node.operator === ts.SyntaxKind.ReadonlyKeyword) {
    return `readonly ${typeShape(node.type, src)}`;
  }
  if (ts.isArrayTypeNode(node)) return `${typeShape(node.elementType, src)}[]`;
  if (ts.isTupleTypeNode(node)) {
    return `[${node.elements.map((e) => typeShape(e, src)).join(', ')}]`;
  }
  return norm(node.getText(src));
};

/** Collapse one declaration node to its shape string. */
const shapeOf = (node, src) => {
  if (ts.isInterfaceDeclaration(node)) return `interface(${membersOf(node.members, src).join(', ')})`;
  if (ts.isClassDeclaration(node)) return `class(${membersOf(node.members, src).join(', ')})`;
  if (ts.isEnumDeclaration(node)) {
    return `enum(${[...new Set(node.members.map((m) => m.name.getText(src)))].sort().join(', ')})`;
  }
  if (ts.isTypeAliasDeclaration(node)) {
    const t = node.type;
    if (ts.isTypeLiteralNode(t)) return `object(${membersOf(t.members, src).join(', ')})`;
    if (ts.isUnionTypeNode(t)) return `union(${typeShape(t, src)})`;
    const arity = arityOf(t);
    if (arity) return `fn(${arity})`;
    return `alias(${typeShape(t, src)})`;
  }
  if (ts.isFunctionDeclaration(node)) return `fn(${arityOf(node)})`;
  if (ts.isModuleDeclaration(node)) return 'namespace';
  return null;
};

/** Shape of one `const a: T` / `const a = …` declarator. */
const shapeOfVariable = (decl, src) => {
  const node = decl.type ?? decl.initializer;
  const arity = arityOf(node);
  if (arity) return `fn(${arity})`;
  return `const(${typeShape(node, src)})`;
};

/**
 * Parse one `.d.ts` into `{ locals, imports, reexports, stars }`.
 *   locals    Map localName → shape string (declared in this file, exported or not)
 *   imports   Map localName → { name, from } for `import { X as Y } from '…'`
 *   reexports Array<{ exported, local, from }>  (`from` null = same file)
 *   stars     Array<moduleSpecifier> from `export * from '…'`
 *
 * `imports` is load-bearing, not bookkeeping: tsup emits `import { Role } from
 * './generated/spaces.js'` followed by a bare `export { Role }`, so a re-export
 * with no `from` clause is NOT always a local declaration. Without the import
 * table those exports resolve to nothing and the snapshot records them as
 * `unknown` — a shape that can never break, i.e. a silently unguarded export.
 *
 * An ambient `declare module 'x' { … }` block is NOT part of this file's own
 * export graph — it declares what a BUILTIN module's types are for apps that
 * `/// <reference>` it (ambient-fs.d.ts declares the sandbox's `fs`, and aliases
 * `node:fs` onto it). Its members are still public API a pinned app compiles
 * against, so they are collected separately under `ambient`, keyed by the module
 * specifier, and surface as `fs::Stats`. Its `export *` is resolved against the
 * sibling ambient blocks in the same file — that is what `node:fs` re-exporting
 * `fs` means here — never against the module graph.
 */
export const parseDts = (path) => {
  const src = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.ES2020, true);
  const locals = new Map();
  const imports = new Map();
  const reexports = [];
  const stars = [];
  const ambient = new Map();
  const isExported = (node) => node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;

  /** Collect the exported declarations of one statement list (a file's top level,
   *  or an ambient module block's body) into `locals`/`reexports`/`stars`. */
  const collect = (statements, sink) => {
    for (const node of statements) {
      if (ts.isImportDeclaration(node) && node.importClause?.namedBindings) {
        const from = node.moduleSpecifier.text;
        const b = node.importClause.namedBindings;
        if (ts.isNamedImports(b)) {
          for (const el of b.elements)
            sink.imports.set(el.name.text, { name: (el.propertyName ?? el.name).text, from });
        }
        continue;
      }
      if (ts.isExportDeclaration(node)) {
        const from = node.moduleSpecifier ? node.moduleSpecifier.text : null;
        if (!node.exportClause) {
          if (from) sink.stars.push(from);
          continue;
        }
        if (ts.isNamedExports(node.exportClause)) {
          for (const el of node.exportClause.elements) {
            sink.reexports.push({ exported: el.name.text, local: (el.propertyName ?? el.name).text, from });
          }
        }
        continue;
      }
      if (ts.isVariableStatement(node)) {
        for (const d of node.declarationList.declarations) {
          if (!ts.isIdentifier(d.name)) continue;
          sink.locals.set(d.name.text, shapeOfVariable(d, src));
          if (isExported(node)) sink.reexports.push({ exported: d.name.text, local: d.name.text, from: null });
        }
        continue;
      }
      if (
        ts.isModuleDeclaration(node) &&
        node.name &&
        ts.isStringLiteral(node.name) &&
        node.body &&
        ts.isModuleBlock(node.body)
      ) {
        const inner = { locals: new Map(), imports: new Map(), reexports: [], stars: [] };
        collect(node.body.statements, inner);
        ambient.set(node.name.text, inner);
        continue;
      }
      const shape = shapeOf(node, src);
      if (shape === null || !node.name) continue;
      sink.locals.set(node.name.text, shape);
      if (isExported(node)) sink.reexports.push({ exported: node.name.text, local: node.name.text, from: null });
    }
  };

  collect(src.statements, { locals, imports, reexports, stars });
  return { locals, imports, reexports, stars, ambient };
};

/** The exported names of one ambient `declare module` block, resolving its
 *  `export *` against its SIBLING blocks in the same file. */
const ambientSurface = (spec, ambient, seen = new Set()) => {
  const block = ambient.get(spec);
  const out = new Map();
  if (!block || seen.has(spec)) return out;
  seen.add(spec);
  for (const from of block.stars) for (const [n, sh] of ambientSurface(from, ambient, seen)) out.set(n, sh);
  for (const { exported, local } of block.reexports) out.set(exported, block.locals.get(local) ?? 'unknown');
  return out;
};

/**
 * Resolve a module specifier appearing in `file` to a `.d.ts` on disk.
 * Relative specifiers stay inside the walked tree; a bare specifier is resolved
 * through node resolution and is BOUNDED to `@immediately-run/*` — a wholesale
 * re-export of a third-party package would make this repo's public surface
 * hostage to someone else's release, which is a design problem to reject rather
 * than a resolution to implement.
 */
export const resolveDts = (spec, file, { root, onError }) => {
  if (spec.startsWith('.')) {
    const base = resolve(dirname(file), spec).replace(/\.(c?js)$/, '');
    for (const cand of [`${base}.d.ts`, `${base}/index.d.ts`]) if (existsSync(cand)) return cand;
    return null;
  }
  if (!spec.startsWith('@immediately-run/')) {
    onError(
      `${relative(root, file)} re-exports ${spec}.\n` +
        'Only @immediately-run/* packages may be re-exported wholesale — the public\n' +
        'surface must not be hostage to a third-party release.',
    );
    return null;
  }
  let target;
  try {
    target = require.resolve(spec, { paths: [root] });
  } catch {
    onError(`cannot resolve ${spec} (re-exported by ${relative(root, file)}).`);
    return null;
  }
  const dts = target.replace(/\.(c?js)$/, '.d.ts');
  if (!existsSync(dts)) {
    onError(`${spec} ships no .d.ts at ${dts}; its exports cannot be pinned.`);
    return null;
  }
  return dts;
};

/**
 * The full public surface of one `.d.ts`: `Map exportedName → shape`, following
 * re-export and star-re-export edges to wherever the declaration actually lives.
 * `seen` breaks import cycles (a cycle contributes nothing new by definition).
 */
export const surfaceOf = (file, ctx, seen = new Set()) => {
  if (ctx.cache.has(file)) return ctx.cache.get(file);
  if (seen.has(file)) return new Map();
  seen.add(file);
  const { locals, imports, reexports, stars, ambient } = ctx.parsed.get(file) ?? ctx.parse(file);
  const out = new Map();
  // Ambient `declare module 'fs'` members are public API a pinned app compiles
  // against (`/// <reference types="@immediately-run/sdk/ambient" />`), so they are
  // guarded too — namespaced by their module specifier so they can never collide
  // with this file's own exports.
  for (const spec of ambient.keys()) {
    for (const [n, sh] of ambientSurface(spec, ambient)) out.set(`${spec}::${n}`, sh);
  }
  for (const spec of stars) {
    const target = resolveDts(spec, file, ctx);
    if (!target) continue;
    for (const [n, s] of surfaceOf(target, ctx, seen)) out.set(n, s);
  }
  for (const { exported, local, from } of reexports) {
    if (exported === 'default') continue; // the SDK ships named exports only
    if (from === null) {
      if (locals.has(local)) {
        out.set(exported, locals.get(local));
        continue;
      }
      // Not declared here — tsup re-exports an imported binding by bare name.
      const via = imports.get(local);
      const target = via ? resolveDts(via.from, file, ctx) : null;
      const shape = target ? surfaceOf(target, ctx, seen).get(via.name) : undefined;
      out.set(exported, shape ?? 'unknown');
      continue;
    }
    const target = resolveDts(from, file, ctx);
    const shape = target ? surfaceOf(target, ctx, seen).get(local) : undefined;
    out.set(exported, shape ?? 'unknown');
  }
  ctx.cache.set(file, out);
  return out;
};

/** Build the resolution context the two helpers above share. */
export const makeContext = ({ root, onError }) => {
  const parsed = new Map();
  const ctx = {
    root,
    onError,
    parsed,
    cache: new Map(),
    parse: (file) => {
      const p = parseDts(file);
      parsed.set(file, p);
      return p;
    },
  };
  return ctx;
};
