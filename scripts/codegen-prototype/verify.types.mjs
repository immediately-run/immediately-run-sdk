// ⚠ NOT IN THE VERIFY CHAIN ANY MORE — and that is deliberate (R3-166 migration).
//
// This gate compared the generated output against an INDEPENDENTLY hand-written
// `src/mounts.ts`. That independence is what made it evidence, and the migration
// consumed it: `mounts.ts` now re-exports `src/generated/spaces.ts`, so for the
// `spaces:*` family this compares generated code to itself. It still passes. It no
// longer asserts anything, and a green check that cannot fail is precisely the bug
// this whole line of work removed — so it is out of `verify:codegen-parity`, and
// `verify-drift.mjs` guards the migrated family instead.
//
// The file is kept because it is the acceptance-test TEMPLATE for the next family:
// point it at an unmigrated one, run it BEFORE swapping, and it does real work
// again. Its `--self-test` also documents the drift classes that matter.
//
// Type-member parity: do the descriptors' SHARED TYPES match the shipped ones,
// field for field?
//
// THE GAP THIS CLOSES. Two existing gates both miss the same thing:
//   - `api:check` compares api-snapshot.json, which is a list of exported NAMES.
//     An interface keeps its name while losing a field, so removing a field is
//     invisible to it.
//   - `verify.mjs` compares the WIRE call and the exported function names. Types
//     never appear on the wire, so it is invisible there too.
// Between them, "the generated `Member` silently drops a public field" passes
// every check in the repo — and the descriptor set does exactly that today: the
// shipped `Member` carries `principal`, a documented @deprecated alias for
// `grantee` kept for back-compat, and `descriptors.spaces.mjs` does not model it.
// Generating from the descriptors would delete it from the public API. That is the
// breaking change R-SDKS-3 exists to forbid, in a shape R-SDKS-3's own wording
// ("don't delete a public SYMBOL") does not quite name.
//
// So this compares the descriptors' emitted type declarations against the BUILT
// `dist/mounts.d.ts` — the actual published type surface — using the TypeScript
// compiler already in devDependencies, rather than a regex over declaration text.
//
// Run: node scripts/codegen-prototype/verify.types.mjs [--self-test]
//      (requires `npm run build`)

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { types as descriptorTypes, family } from './descriptors.spaces.mjs';
const descriptorMethods = family.methods;

const require = createRequire(import.meta.url);
const ts = require('typescript');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dtsPath = resolve(root, 'dist/mounts.d.ts');
const generatedPath = resolve(root, 'scripts/codegen-prototype/generated/spaces.generated.ts');

for (const [label, p] of [
  ['dist/mounts.d.ts', dtsPath],
  ['the generated family', generatedPath],
]) {
  if (!existsSync(p)) {
    console.error(`error: ${label} missing (${p}) — run \`npm run build\` and the generator first.`);
    process.exit(1);
  }
}

/**
 * Extract every exported interface / type-alias from a source file as
 * `name → { kind, members }`, where an interface's members are
 * `{ name, optional }` and a type alias records its printed text.
 *
 * Structural, via the compiler's own AST — a regex over `.d.ts` text would trip
 * on JSDoc, multi-line unions, and nested object literals.
 */
const declarationsOf = (path) => {
  const src = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.ES2020, true);
  const all = new Map();
  /** The JSDoc text attached to a declaration, normalised for comparison. The
   *  shipped types carry substantial prose (the grantee/`principal` rationale, the
   *  AA-01 `appKey` explanation); a descriptor's one-line `description` replacing
   *  it is a silent DOWNGRADE of exactly the discoverability SDK_SIMPLIFICATION
   *  exists to improve, so it is compared, not assumed. */
  const docOf = (node) => {
    const ranges = ts.getLeadingCommentRanges(src.text, node.pos) ?? [];
    const jsdoc = ranges.map((r) => src.text.slice(r.pos, r.end)).filter((t) => t.startsWith('/**'));
    if (jsdoc.length === 0) return '';
    return (
      jsdoc[jsdoc.length - 1]
        .replace(/^\/\*\*|\*\/$/g, '')
        .split('\n')
        .map((l) => l.replace(/^\s*\*/, '').trim())
        // A line ending in `-` is a SOFT hyphen-wrap in the source ("already-" /
        // "invited/member"), not two words. Joining those with a space would report
        // a phantom doc loss, so rejoin them directly.
        .reduce((acc, line) => (acc.endsWith('-') ? acc + line : acc ? `${acc} ${line}` : line), '')
        .replace(/\s+/g, ' ')
        .trim()
    );
  };
  const hasExportModifier = (node) => node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;

  // Two export styles must both be understood. The GENERATED `.ts` uses inline
  // `export interface X`; tsup's emitted `.d.ts` uses `declare interface X` plus a
  // trailing `export { type X, … }` list. Collect every declaration, then keep the
  // ones actually exported by either route.
  const exportedNames = new Set();
  for (const node of src.statements) {
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const el of node.exportClause.elements) exportedNames.add(el.name.text);
    }
  }

  for (const node of src.statements) {
    if (hasExportModifier(node)) {
      // A VariableStatement carries no `.name` — the names live on its
      // declarations (`export const a = …, b = …`), so it needs its own arm.
      if (ts.isVariableStatement(node)) {
        for (const d of node.declarationList.declarations) {
          if (ts.isIdentifier(d.name)) exportedNames.add(d.name.text);
        }
      } else if (node.name) {
        exportedNames.add(node.name.text);
      }
    }
    if (ts.isInterfaceDeclaration(node)) {
      all.set(node.name.text, {
        kind: 'interface',
        doc: docOf(node),
        members: node.members
          .filter((m) => m.name)
          .map((m) => ({
            name: m.name.getText(src),
            optional: m.questionToken !== undefined,
            doc: docOf(m),
          })),
      });
    } else if (ts.isTypeAliasDeclaration(node)) {
      // Normalise whitespace so a reformat isn't reported as a change; a union's
      // MEMBER SET is what matters, and for these families the aliases are unions
      // of string literals.
      const text = node.type.getText(src).replace(/\s+/g, ' ').trim();
      const members = text
        .split('|')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)
        .sort();
      all.set(node.name.text, { kind: 'alias', doc: docOf(node), text, members });
    } else if (ts.isVariableStatement(node)) {
      // The wrappers themselves: `declare const f: (…) => …` in the emitted
      // `.d.ts`, `export const f = …` in the generated source. Their prose is the
      // most-read part of the surface, so it is compared too; the SHAPE of a
      // function is already covered by the wire check, so only arity is compared
      // here (the two files express types differently — explicit vs inferred).
      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue;
        const fnNode = decl.initializer ?? decl.type;
        const params =
          fnNode && (ts.isArrowFunction(fnNode) || ts.isFunctionTypeNode(fnNode))
            ? fnNode.parameters.map((prm) => prm.name.getText(src))
            : null;
        all.set(decl.name.text, { kind: 'function', doc: docOf(node), params });
      }
    }
  }
  return new Map([...all].filter(([name]) => exportedNames.has(name)));
};

const shipped = declarationsOf(dtsPath);
const generated = declarationsOf(generatedPath);

/** Compare one type. Returns a list of human-readable problems (empty = match). */
const compareType = (name) => {
  const s = shipped.get(name);
  const g = generated.get(name);
  const problems = [];
  if (!s) {
    problems.push(`not exported from dist/mounts.d.ts (descriptor describes a type the SDK doesn't ship)`);
    return problems;
  }
  if (!g) {
    problems.push(`the generator emitted no declaration for it`);
    return problems;
  }
  if (s.kind !== g.kind) {
    problems.push(`kind differs: shipped ${s.kind}, generated ${g.kind}`);
    return problems;
  }

  // DOC parity, as NO INFORMATION LOSS rather than byte-equality.
  //
  // Byte-equality is the wrong bar and would defeat the point: the generated doc is
  // deliberately a SUPERSET — it appends the capability, the catalog name, and a
  // `@throws` line the hand-written prose does not carry. Demanding identity would
  // force the generator to reproduce hand-written phrasing verbatim.
  //
  // What must not happen is prose disappearing: `GrantRecord.appKey`'s explanation
  // going to nothing, or `Member.grantee`'s rationale flattening to a one-liner. So
  // the test is that every meaningful word of the SHIPPED doc still appears
  // somewhere in the generated one. Rewording is allowed; deletion is not. False
  // negatives are possible (a reworded doc reusing the same words) — the bar is
  // deliberately loose in that direction, because the failure being guarded is
  // wholesale loss.
  const docWords = (d) =>
    (d || '')
      .replace(/\{@link\s+([^}]+)\}/g, '$1') // {@link X} → X
      .toLowerCase()
      .replace(/[*`_]/g, '')
      .split(/[^a-z0-9:§'’.-]+/)
      .map((w) => w.replace(/^[.'’-]+|[.'’-]+$/g, ''))
      .filter((w) => w.length > 2);
  const docLoss = (shippedDoc, generatedDoc) => {
    const have = new Set(docWords(generatedDoc));
    return [...new Set(docWords(shippedDoc))].filter((w) => !have.has(w));
  };

  const lost = docLoss(s.doc, g.doc);
  if (lost.length) {
    problems.push(`doc LOSES: ${lost.join(', ')}\n     shipped:   ${s.doc}\n     generated: ${g.doc || '(none)'}`);
  }
  for (const m of s.members ?? []) {
    const gm = (g.members ?? []).find((x) => x.name === m.name);
    if (!gm) continue;
    const mLost = docLoss(m.doc, gm.doc);
    if (mLost.length) {
      problems.push(
        `\`${m.name}\` doc LOSES: ${mLost.join(', ')}\n     shipped:   ${m.doc}\n     generated: ${gm.doc || '(none)'}`,
      );
    }
  }

  if (s.kind === 'function') {
    if (s.params && g.params && s.params.length !== g.params.length) {
      problems.push(`arity differs: shipped (${s.params.join(', ')}), generated (${g.params.join(', ')})`);
    }
    return problems; // doc compared above; SHAPE is the wire check's job
  }

  if (s.kind === 'alias') {
    const missing = s.members.filter((m) => !g.members.includes(m));
    const extra = g.members.filter((m) => !s.members.includes(m));
    if (missing.length) problems.push(`union members MISSING from generated: ${missing.join(', ')}`);
    if (extra.length) problems.push(`union members ADDED by generated: ${extra.join(', ')}`);
    return problems;
  }

  const sNames = new Set(s.members.map((m) => m.name));
  const gNames = new Set(g.members.map((m) => m.name));
  // A DROPPED field is the breaking one — an app reading it stops compiling.
  const dropped = [...sNames].filter((n) => !gNames.has(n));
  const added = [...gNames].filter((n) => !sNames.has(n));
  if (dropped.length) {
    problems.push(
      `field(s) DROPPED by the generated type: ${dropped.join(', ')} — ` +
        `removing a public field is a breaking change (R-SDKS-3), and neither ` +
        `\`api:check\` (names only) nor the wire check can see it`,
    );
  }
  if (added.length) problems.push(`field(s) ADDED by the generated type: ${added.join(', ')}`);
  for (const m of s.members) {
    const gm = g.members.find((x) => x.name === m.name);
    if (gm && gm.optional !== m.optional) {
      problems.push(
        `\`${m.name}\` optionality differs: shipped ${m.optional ? 'optional' : 'required'}, ` +
          `generated ${gm.optional ? 'optional' : 'required'}`,
      );
    }
  }
  return problems;
};

const checkAll = ({ quiet = false } = {}) => {
  const failures = [];
  let pass = 0;
  const subjects = [...Object.keys(descriptorTypes), ...descriptorMethods.map((m) => m.alias.fn)];
  for (const name of subjects) {
    const problems = compareType(name);
    if (problems.length === 0) {
      pass++;
      if (!quiet) console.log(`PASS  ${name}`);
    } else {
      failures.push({ name, problems });
      if (!quiet) {
        console.log(`FAIL  ${name}`);
        for (const p of problems) console.log(`   - ${p}`);
      }
    }
  }
  return { pass, failures, total: subjects.length };
};

const main = () => {
  const { pass, failures, total } = checkAll();
  console.log(`\n${pass}/${total} types + wrappers: descriptor ≡ the SHIPPED type/doc surface.`);
  if (failures.length) {
    console.error(
      `\n${failures.length} type(s) differ from what the SDK ships. Until they agree, generating\n` +
        `this family would CHANGE the published types — the descriptor set is not yet a\n` +
        `faithful single source. Add the missing shape to the descriptor (preferred: the\n` +
        `descriptors should describe reality, including deprecated fields), or, if the field\n` +
        `is genuinely going away, retire it deliberately as a breaking change.`,
    );
    process.exit(1);
  }
};

// ── --self-test: the same discipline as the other two gates ────────────────────
const selfTest = () => {
  const cases = [
    [
      'a generated interface that DROPS a shipped field',
      () => {
        const m = generated.get('Member');
        const saved = m.members;
        m.members = saved.filter((x) => x.name !== 'grantee');
        return () => {
          m.members = saved;
        };
      },
    ],
    [
      'a generated interface that ADDS a field the SDK does not ship',
      () => {
        const m = generated.get('SpaceInfo');
        const saved = m.members;
        m.members = [...saved, { name: 'inventedField', optional: false }];
        return () => {
          m.members = saved;
        };
      },
    ],
    [
      'a field whose optionality flipped',
      () => {
        const m = generated.get('SpaceInfo');
        const saved = m.members;
        m.members = saved.map((x) => (x.name === 'owner' ? { ...x, optional: false } : x));
        return () => {
          m.members = saved;
        };
      },
    ],
    [
      'a union alias missing a member',
      () => {
        const a = generated.get('Role');
        const saved = a.members;
        a.members = saved.filter((x) => x !== 'reader');
        return () => {
          a.members = saved;
        };
      },
    ],
  ];

  let ok = 0;
  for (const [label, poison] of cases) {
    const restore = poison();
    const { failures } = checkAll({ quiet: true });
    restore();
    const caught = failures.length > 0;
    console.log(`${caught ? 'PASS' : 'FAIL'}  detects: ${label}`);
    if (caught) ok++;
  }
  const total = cases.length;
  console.log(`\n${ok}/${total} self-test cases.`);
  if (ok !== total) {
    console.error('\nself-test FAILED — the type-parity gate is not detecting drift it must detect.');
    process.exit(1);
  }
};

if (process.argv.includes('--self-test')) selfTest();
else main();
