// Is the SHIPPED generated source still what the descriptors produce?
//
// WHY THIS REPLACED THE PARITY GATES FOR THIS FAMILY. Before the migration,
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
// Run: node scripts/codegen-prototype/verify-drift.mjs [--self-test]

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const shippedPath = resolve(root, 'src/generated/spaces.ts');

if (!existsSync(shippedPath)) {
  console.error(`error: ${shippedPath} missing — run the generator with --emit-src.`);
  process.exit(1);
}

/** Regenerate into a scratch copy of the tree and return the emitted text. */
const regenerate = () => {
  const tmp = mkdtempSync(join(tmpdir(), 'ir-codegen-'));
  try {
    // The generator writes relative to its own location, so it needs the script +
    // descriptors, and it creates `<tmp>/src/generated/`.
    cpSync(here, join(tmp, 'scripts', 'codegen-prototype'), { recursive: true });
    execFileSync(process.execPath, ['generate.mjs', './descriptors.spaces.mjs', '--emit-src'], {
      cwd: join(tmp, 'scripts', 'codegen-prototype'),
      stdio: 'pipe',
    });
    return readFileSync(join(tmp, 'src', 'generated', 'spaces.ts'), 'utf8');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
};

const check = (shippedText) => {
  const fresh = regenerate();
  if (fresh === shippedText) return null;
  // Report the first differing line — the whole file is generated, so a full diff
  // is rarely more informative than "here, and it's stale".
  const a = shippedText.split('\n');
  const b = fresh.split('\n');
  const i = a.findIndex((l, n) => l !== b[n]);
  return {
    line: i + 1,
    shipped: a[i] ?? '(end of file)',
    fresh: b[i] ?? '(end of file)',
  };
};

const main = () => {
  const diff = check(readFileSync(shippedPath, 'utf8'));
  if (!diff) {
    console.log('PASS  src/generated/spaces.ts is exactly what the descriptors produce.');
    return;
  }
  console.log('FAIL  src/generated/spaces.ts differs from a fresh generation.');
  console.log(`   first difference at line ${diff.line}`);
  console.log(`     committed: ${diff.shipped}`);
  console.log(`     generated: ${diff.fresh}`);
  console.error(
    '\nThe generated source is SHIPPED — `src/mounts.ts` re-exports it, so this is the\n' +
      'public API. Either the file was hand-edited (it is generated; edit\n' +
      '`descriptors.spaces.mjs` instead) or a descriptor change was not regenerated.\n' +
      'Fix with: node scripts/codegen-prototype/generate.mjs ./descriptors.spaces.mjs --emit-src',
  );
  process.exit(1);
};

// ── --self-test: the same discipline as the parity gates ───────────────────────
const selfTest = () => {
  const real = readFileSync(shippedPath, 'utf8');
  const cases = [
    ['a hand-edited line', real.replace('export const listGrants', 'export const listGrantsEdited')],
    [
      'a deleted line',
      real
        .split('\n')
        .filter((_, i) => i !== 20)
        .join('\n'),
    ],
    ['an appended line', real + '\nexport const sneaked = 1;\n'],
  ];
  let ok = 0;
  for (const [label, poisoned] of cases) {
    const caught = check(poisoned) !== null;
    console.log(`${caught ? 'PASS' : 'FAIL'}  detects: ${label}`);
    if (caught) ok++;
  }
  const cleanOk = check(real) === null;
  console.log(`${cleanOk ? 'PASS' : 'FAIL'}  the committed file is clean (no false positive)`);
  const got = ok + (cleanOk ? 1 : 0);
  const total = cases.length + 1;
  console.log(`\n${got}/${total} self-test cases.`);
  if (got !== total) {
    console.error('\nself-test FAILED — the drift gate is not detecting drift it must detect.');
    process.exit(1);
  }
};

if (process.argv.includes('--self-test')) selfTest();
else main();
