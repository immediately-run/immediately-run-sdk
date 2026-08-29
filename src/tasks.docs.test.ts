// R3-425 review — the EXAMPLES in `src/tasks.ts` must name the real API.
//
// WHY THIS IS A TEST AND NOT A PROOFREAD. Those JSDoc blocks are the source of the
// generated `llms.txt` / `api.json` — the agent-consumption contract — so a snippet
// that cannot be copy-pasted propagates into every agent that reads the docs before
// writing app code. The one that shipped called a bare `writeFile(...)`, which this
// SDK does not export: it is a `MountFs` METHOD you get from `openFs(mount)`.
//
// WHAT IT CHECKS. Every ```ts fence in the file: each function called by BARE name
// (never `obj.method(...)`, which is the object's business) must be either declared
// inside the snippet or exported from the package root. That is exactly the class of
// error above, and it is decidable without running the snippet.
//
// SCOPE. `tasks.ts` only, deliberately: it is the file the finding is about, and a
// repo-wide sweep is a separate change with a much larger diff.
export {}; // module scope — keep local names out of the shared-tsc global scope
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = (name: string): string => readFileSync(join(__dirname, name), 'utf8');

/** The names a `@immediately-run/sdk` consumer can import from the package root. */
const publicNames = (): Set<string> => {
  const index = src('index.ts');
  const snapshot = JSON.parse(readFileSync(join(__dirname, '..', 'api-snapshot.json'), 'utf8')) as Record<
    string,
    Record<string, string>
  >;
  const names = new Set<string>();
  // `export * from './x'` — every recorded export of module x is reachable at the root.
  for (const [, mod] of [...index.matchAll(/export \* from '\.\/([\w./-]+)'/g)])
    for (const name of Object.keys(snapshot[mod] ?? {})) names.add(name);
  // `export { A, B } from './x'` — only the named ones.
  for (const [, list] of [...index.matchAll(/export \{([^}]*)\} from '\.\/[\w./-]+'/g)])
    for (const raw of list.split(','))
      if (raw.trim())
        names.add(
          raw
            .trim()
            .split(/\s+as\s+/)
            .pop()!
            .trim(),
        );
  return names;
};

/** The ```ts fences inside a source file's comments, with the comment prefixes stripped. */
const snippets = (text: string): string[] => {
  const lines = text.split('\n').map((l) => l.replace(/^\s*(?:\* ?|\/\/ ?)/, ''));
  const out: string[] = [];
  let open: string[] | null = null;
  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      if (open) {
        out.push(open.join('\n'));
        open = null;
      } else if (/^```(ts|tsx|typescript)?$/.test(line.trim())) {
        open = [];
      }
      continue;
    }
    if (open) open.push(line);
  }
  return out;
};

// Language keywords and platform globals a snippet may call without importing them.
const AMBIENT = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'return',
  'typeof',
  'await',
  'function',
  'super',
  'Array',
  'Boolean',
  'Error',
  'JSON',
  'Map',
  'Number',
  'Object',
  'Promise',
  'Set',
  'String',
  'Uint8Array',
  'URL',
  'console',
  'fetch',
  'queueMicrotask',
  'setTimeout',
  'structuredClone',
]);

/**
 * Comments and string/template literals removed, so prose in a snippet's own comment
 * ("`id` is optional (absent on …)") is not mistaken for a call. Dropping template
 * bodies can hide a call made INSIDE `${…}`; that is the accepted blind spot — a
 * false negative, never a false alarm.
 */
const stripNoise = (code: string): string =>
  code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');

/** Bare-name call targets in a snippet that it neither declares nor imports. */
const undeclaredCalls = (raw: string, known: Set<string>): string[] => {
  const snippet = stripNoise(raw);
  const declared = new Set<string>();
  for (const [, list] of [...snippet.matchAll(/import\s+\{([^}]*)\}\s+from/g)])
    for (const spec of list.split(','))
      if (spec.trim())
        declared.add(
          spec
            .trim()
            .split(/\s+as\s+/)
            .pop()!
            .trim(),
        );
  for (const [, name] of [...snippet.matchAll(/\b(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/g)])
    declared.add(name);
  // A call target: an identifier not preceded by `.`, optionally generic, then `(`.
  const called = new Set(
    [...snippet.matchAll(/(?<![.\w$'"`])([A-Za-z_$][\w$]*)\s*(?:<[^<>()]*>)?\s*\(/g)].map(([, n]) => n),
  );
  return [...called].filter((n) => !AMBIENT.has(n) && !declared.has(n) && !known.has(n));
};

it('the module-level helper finds a call the snippet cannot resolve (self-test)', () => {
  const known = new Set(['openFs']);
  // The exact bug this file exists for: a bare `writeFile` the SDK does not export.
  expect(undeclaredCalls("await writeFile('a.jpg', bytes);", known)).toEqual(['writeFile']);
  expect(undeclaredCalls("const fs = openFs(m); await fs.writeFile('a.jpg', bytes);", known)).toEqual([]);
  // …and prose in the snippet's own comment is not a call.
  expect(undeclaredCalls('// `id` is optional (absent on the repo mount)\nopenFs(m);', known)).toEqual([]);
});

it('every ts example in tasks.ts calls only the real, exported API', () => {
  const known = publicNames();
  expect(known.has('capturePhoto')).toBe(true); // the snapshot really was read
  const blocks = snippets(src('tasks.ts'));
  expect(blocks.length).toBeGreaterThan(0);
  for (const block of blocks)
    expect({ block, undeclared: undeclaredCalls(block, known) }).toEqual({
      block,
      undeclared: [],
    });
});
