// Is every shipped / committed generated artifact still what the descriptors
// produce?
//
// WHY THIS REPLACED THE PARITY GATES FOR THE MIGRATED FAMILY. Before the migration,
// `verify.mjs` (wire) and `verify.types.mjs` (types + docs) compared the generated
// output against an independently hand-written `src/mounts.ts`. That comparison was
// the acceptance test for the swap, and it did real work — it caught a `shareSpace`
// that never existed, a dropped `Member.principal`, and several docs about to be
// flattened.
//
// The swap CONSUMED that independence. `src/mounts.ts` now re-exports
// `src/generated/spaces.ts`, so "generated ≡ shipped" compares the generated file
// to itself. Both gates still pass, and for this family they now assert nothing.
// Leaving them in the verify chain would be the exact failure this whole line of
// work exists to remove: a green check that cannot fail. They are kept as files —
// their `--self-test`s document the drift classes, and they become live again for
// the NEXT family, before it is migrated — but they are out of the chain, and THIS
// is what guards the migrated one.
//
// What can still go wrong once the source is generated:
//   1. someone edits `src/generated/spaces.ts` by hand (it says DO NOT EDIT, which
//      is a request, not a mechanism);
//   2. someone edits the descriptors and forgets to regenerate + commit;
//   3. the generator changes and the committed output goes stale.
// All three are the same check: regenerate, compare bytes.
//
// Every committed artifact is compared, not just the shipped module. The
// prototype's `generated/` outputs (`<family>.generated.ts`, `<family>.llms.txt`,
// `<family>.catalog.json`) are committed too, and before they joined this gate they
// drifted silently for a whole prettier-config adoption (#114 regenerated spaces
// only; streams stayed stale with every check green — found by the R3-166 round-1
// review, which is why the artifact legs exist).
//
// Run: node scripts/codegen-prototype/verify-drift.mjs [--self-test]

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, cpSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const shippedPath = resolve(root, 'src/generated/spaces.ts');

if (!existsSync(shippedPath)) {
  console.error(`error: ${shippedPath} missing — run the generator with --emit-src.`);
  process.exit(1);
}

// The artifact set: the shipped spaces module, plus every committed prototype
// projection for every descriptor family (generated/<family>.{generated.ts,llms.txt,catalog.json}).
// The family names come from each descriptor module's `family.scheme` — the same
// field the generator names its outputs by — not from the descriptor file name,
// so a file named differently from its scheme can never make this gate blame the
// generator for a "missing" projection (round-3 nit on #174).
const descriptorFiles = readdirSync(here)
  .filter((f) => /^descriptors\..+\.mjs$/.test(f))
  .sort();
if (!descriptorFiles.length) {
  console.error('error: no descriptor families found — the drift gate is vacuous, which is a failure.');
  process.exit(1);
}

/** Map descriptor modules to their `{file, scheme}` families, naming the two
 *  failure classes: a module exporting no `family.scheme`, and two modules
 *  declaring the same scheme (one projection set, two sources). Pure — the
 *  self-test drives it directly with synthetic entries. */
const familyViolations = (entries) => {
  const out = [];
  const schemeOwner = new Map();
  for (const { file, family } of entries) {
    const scheme = family?.scheme;
    if (!scheme) {
      out.push(`${file} exports no \`family.scheme\` — cannot derive its artifact names.`);
      continue;
    }
    const prior = schemeOwner.get(scheme);
    if (prior) out.push(`${file} and ${prior} both declare scheme \`${scheme}\` — one projection set, two sources.`);
    else schemeOwner.set(scheme, file);
  }
  return out;
};

const descriptorEntries = [];
for (const f of descriptorFiles) {
  const { family } = await import(pathToFileURL(join(here, f)).href);
  descriptorEntries.push({ file: f, family });
}
const familyProblems = familyViolations(descriptorEntries);
if (familyProblems.length) {
  for (const p of familyProblems) console.error(`error: ${p}`);
  process.exit(1);
}
const families = descriptorEntries.map(({ file, family }) => ({ file, scheme: family.scheme }));
const artifactPaths = (scheme) => [
  ['generated', `${scheme}.generated.ts`],
  ['generated', `${scheme}.llms.txt`],
  ['generated', `${scheme}.catalog.json`],
];

/** The committed `generated/` dir must contain exactly the live families' three
 *  projections each — an orphaned artifact (its descriptor deleted, or committed
 *  without one) escapes the byte-comparison above, which is the silent-stale class
 *  this gate exists for, so it fails loudly instead. Parameters default to the
 *  repo state so the self-test can drive the mismatch directly. */
const orphanedArtifacts = (committedFiles = readdirSync(join(here, 'generated')), liveFamilies = families) => {
  const expected = new Set(liveFamilies.flatMap((f) => artifactPaths(f.scheme).map(([, file]) => file)));
  return committedFiles.filter((file) => !expected.has(file));
};

/** Regenerate into a scratch copy of the tree and return the emitted texts. */
const regenerate = () => {
  const tmp = mkdtempSync(join(tmpdir(), 'ir-codegen-'));
  try {
    // The generator writes relative to its own location, so it needs the script +
    // descriptors, and it creates `<tmp>/src/generated/` and `<tmp>generated/`.
    cpSync(here, join(tmp, 'scripts', 'codegen-prototype'), { recursive: true });
    // The copy just seeded the scratch `generated/` dir with the COMMITTED
    // artifacts — delete them, so the byte-comparison below reads only what this
    // run's generator actually wrote. Otherwise a generator that stops emitting a
    // projection false-passes against its own stale copy (round-2 review,
    // fault-injected). `generate.mjs` recreates the dir via mkdirSync.
    rmSync(join(tmp, 'scripts', 'codegen-prototype', 'generated'), { recursive: true, force: true });
    execFileSync(process.execPath, ['generate.mjs', './descriptors.spaces.mjs', '--emit-src'], {
      cwd: join(tmp, 'scripts', 'codegen-prototype'),
      stdio: 'pipe',
    });
    const texts = { src: readFileSync(join(tmp, 'src', 'generated', 'spaces.ts'), 'utf8') };
    for (const { file, scheme } of families) {
      execFileSync(process.execPath, ['generate.mjs', `./${file}`], {
        cwd: join(tmp, 'scripts', 'codegen-prototype'),
        stdio: 'pipe',
      });
      for (const [dir, file0] of artifactPaths(scheme)) {
        const p = join(tmp, 'scripts', 'codegen-prototype', dir, file0);
        if (!existsSync(p)) {
          console.error(
            `error: the generator wrote no ${file0} for family ${scheme} — a projection stopped being emitted.`,
          );
          process.exit(1);
        }
        texts[`${scheme}/${file0}`] = readFileSync(p, 'utf8');
      }
    }
    return texts;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
};

/** `texts` maps artifact key → committed text (the src module is key 'src').
 *  Returns the first difference found, or null when everything matches. */
const check = (texts) => {
  const fresh = regenerate();
  for (const key of Object.keys(fresh)) {
    if (fresh[key] !== texts[key]) {
      const a = texts[key].split('\n');
      const b = fresh[key].split('\n');
      const i = a.findIndex((l, n) => l !== b[n]);
      return {
        artifact: key === 'src' ? 'src/generated/spaces.ts' : `scripts/codegen-prototype/generated/${key}`,
        line: i + 1,
        committed: a[i] ?? '(end of file)',
        fresh: b[i] ?? '(end of file)',
      };
    }
  }
  return null;
};

/** The committed texts of every artifact this gate guards. */
const committedTexts = () => {
  const texts = { src: readFileSync(shippedPath, 'utf8') };
  for (const { scheme } of families) {
    for (const [dir, file] of artifactPaths(scheme)) {
      const p = join(here, dir, file);
      if (!existsSync(p)) {
        console.error(`error: ${p} missing — run the generator and commit its output.`);
        process.exit(1);
      }
      texts[`${scheme}/${file}`] = readFileSync(p, 'utf8');
    }
  }
  return texts;
};

const main = () => {
  const orphans = orphanedArtifacts();
  if (orphans.length) {
    console.error('FAIL  committed generated/ artifacts with no descriptor family:');
    for (const o of orphans) console.error(`  · generated/${o} (no descriptors.*.mjs produces it)`);
    console.error(
      '  An orphaned projection is invisible to the byte-comparison — delete it or restore its descriptor.',
    );
    process.exit(1);
  }
  const diff = check(committedTexts());
  if (!diff) {
    console.log(
      `PASS  all ${1 + families.length * 3} generated artifacts (src/generated/spaces.ts + ${
        families.length
      } family projections) are exactly what the descriptors produce.`,
    );
    return;
  }
  console.log('FAIL  a committed generated artifact differs from a fresh generation.');
  console.log(`   artifact: ${diff.artifact}`);
  console.log(`   first difference at line ${diff.line}`);
  console.log(`     committed: ${diff.committed}`);
  console.log(`     generated: ${diff.fresh}`);
  console.error(
    '\nThe generated source is shipped — `src/mounts.ts` re-exports it, so this is the\n' +
      'public API, and the `generated/` projections are committed artifacts. Either a\n' +
      'file was hand-edited (they are generated; edit `descriptors.<family>.mjs` instead)\n' +
      'or a descriptor change was not regenerated.\n' +
      'Fix with: node scripts/codegen-prototype/generate.mjs ./descriptors.<family>.mjs [--emit-src for spaces]',
  );
  process.exit(1);
};

// ── --self-test: the same discipline as the parity gates ───────────────────────
const selfTest = () => {
  const real = committedTexts();
  const srcKey = 'src';
  const other = families.find((f) => f.scheme !== 'spaces') ?? families[0];
  const streamsKey = `${other.scheme}/${artifactPaths(other.scheme)[0][1]}`;
  const cases = [
    [
      'a hand-edited line in the shipped module',
      { ...real, [srcKey]: real[srcKey].replace('export const listGrants', 'export const listGrantsEdited') },
    ],
    [
      'a deleted line in the shipped module',
      {
        ...real,
        [srcKey]: real[srcKey]
          .split('\n')
          .filter((_, i) => i !== 20)
          .join('\n'),
      },
    ],
    ['an appended line in the shipped module', { ...real, [srcKey]: real[srcKey] + '\nexport const sneaked = 1;\n' }],
    ['a hand-edited committed artifact', { ...real, [streamsKey]: real[streamsKey].replace('export', 'exportEdited') }],
  ];
  let ok = 0;
  for (const [label, poisoned] of cases) {
    const caught = check(poisoned) !== null;
    console.log(`${caught ? 'PASS' : 'FAIL'}  detects: ${label}`);
    if (caught) ok++;
  }
  // Orphans are checked structurally (the committed dir vs the live families), not
  // by text poisoning — drive the mismatch directly through the same function.
  const orphanCaught =
    orphanedArtifacts([
      ...families.flatMap((f) => artifactPaths(f.scheme).map(([, file]) => file)),
      'invites.llms.txt',
    ]).join() === 'invites.llms.txt';
  console.log(`${orphanCaught ? 'PASS' : 'FAIL'}  detects: an orphaned committed artifact (no descriptor produces it)`);
  if (orphanCaught) ok++;
  // The family-collection guards, driven directly with synthetic entries.
  const missingSchemeCaught = familyViolations([{ file: 'descriptors.broken.mjs', family: {} }]).length === 1;
  console.log(`${missingSchemeCaught ? 'PASS' : 'FAIL'}  detects: a descriptor module exporting no family.scheme`);
  if (missingSchemeCaught) ok++;
  const duplicateSchemeCaught =
    familyViolations([
      { file: 'descriptors.spaces.mjs', family: { scheme: 'spaces' } },
      { file: 'descriptors.zdupe.mjs', family: { scheme: 'spaces' } },
    ]).length === 1;
  console.log(`${duplicateSchemeCaught ? 'PASS' : 'FAIL'}  detects: two descriptor files declaring one scheme`);
  if (duplicateSchemeCaught) ok++;
  const familiesClean = familyViolations(descriptorEntries).length === 0;
  console.log(`${familiesClean ? 'PASS' : 'FAIL'}  the live descriptor modules collect cleanly`);
  if (familiesClean) ok++;
  const cleanOk = check(real) === null && orphanedArtifacts().length === 0;
  console.log(`${cleanOk ? 'PASS' : 'FAIL'}  the committed files are clean (no false positive, no orphans)`);
  if (cleanOk) ok++;
  const total = cases.length + 5;
  console.log(`\n${ok}/${total} self-test cases.`);
  if (ok !== total) {
    console.error('\nself-test FAILED — the drift gate is not detecting drift it must detect.');
    process.exit(1);
  }
};

if (process.argv.includes('--self-test')) selfTest();
else main();
