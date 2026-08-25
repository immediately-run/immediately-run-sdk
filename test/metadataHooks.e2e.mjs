// R3-276 — drive the BUILT SDK in node and prove the metadata surface behaves.
//
// `api-snapshot.json` guards exported NAMES, not behaviour, so "additive" has to be
// demonstrated by running the thing: an app written against the previous published
// shape — a query that returns bare PATHS, `useFileMetadata` by key,
// `useAllMetadata` — must keep getting exactly what it got, from the same built
// files a real app loads, while the new record and provider forms work alongside it.
//
// Two mechanics make importing the dist possible (see the drive-the-built-SDK memory):
// tsup emits extensionless relative specifiers that Node's ESM resolver rejects, and
// the transport resolves lazily so importing is safe without a host. Only the first
// applies here — these hooks touch no transport.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.[cm]?js$/.test(spec) && ctx.parentURL) {
      const p = fileURLToPath(new URL(spec, ctx.parentURL)) + '.js';
      if (existsSync(p)) return { url: pathToFileURL(p).href, shortCircuit: true };
    }
    return next(spec, ctx);
  },
});

const load = (rel) => import(pathToFileURL(join(dist, rel)).href);

const { createElement: h } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const hooks = await load('hooks.js');
const { MetadataSource } = await load('metadataSource.js');
const { TinkerableContext } = await load('TinkerableContext.js');

const FILES = {
  '/app/a.mdx': { title: 'A' },
  '/app/b.mdx': { title: 'B', draft: true },
};

/** Render a probe against the built hooks and return what the hook produced. */
const run = (useHook, { host = FILES, source, mode } = {}) => {
  let captured;
  const Probe = () => {
    captured = useHook();
    return null;
  };
  const tree = source ? h(MetadataSource, { value: source, mode }, h(Probe)) : h(Probe);
  renderToStaticMarkup(h(TinkerableContext.Provider, { value: { filesMetadata: host } }, tree));
  return captured;
};

test('the previous published shape still behaves: a path-returning query', () => {
  const out = run(() => hooks.useMetadataQuery((m) => Object.keys(m).filter((p) => !m[p].draft)));
  assert.deepEqual(out, [{ path: '/app/a.mdx', meta: FILES['/app/a.mdx'] }]);
});

test('the previous published shape still behaves: useFileMetadata + useAllMetadata', () => {
  assert.deepEqual(
    run(() => hooks.useFileMetadata('/app/a.mdx')),
    { title: 'A' },
  );
  assert.deepEqual(
    run(() => hooks.useAllMetadata()),
    FILES,
  );
});

test('a throwing query is still reported as { error }, not a crash', () => {
  const out = run(() =>
    hooks.useMetadataQuery(() => {
      throw new Error('boom');
    }),
  );
  assert.equal(out.error instanceof Error, true);
  assert.equal(out.error.message, 'boom');
});

test('R3-276: a record-returning query carries its extra fields', () => {
  const out = run(() => hooks.useMetadataQuery((m) => Object.keys(m).map((path) => ({ path, n: m[path].title }))));
  assert.deepEqual(out, [
    { path: '/app/a.mdx', meta: FILES['/app/a.mdx'], n: 'A' },
    { path: '/app/b.mdx', meta: FILES['/app/b.mdx'], n: 'B' },
  ]);
});

test('R3-276: MetadataSource replaces the store for descendants, and merge layers over it', () => {
  const source = { '/corpus/x.mdx': { title: 'X' } };
  assert.deepEqual(
    run(() => hooks.useAllMetadata(), { source }),
    source,
  );
  assert.deepEqual(
    run(() => hooks.useAllMetadata(), { source, mode: 'merge' }),
    {
      ...FILES,
      ...source,
    },
  );
});

test('R3-276: useFileMetadata accepts the repo-relative form the old doc taught', () => {
  assert.deepEqual(
    run(() => hooks.useFileMetadata('/a.mdx')),
    { title: 'A' },
  );
});

// The ambient declarations are TYPES ONLY. The criterion is about the BUILT graph:
// referencing them must not drag the SDK's sandbox-adapter tier into an app bundle.
test('R3-276: the shipped ambient declarations pull nothing at runtime', () => {
  const decl = join(dist, 'ambient.d.ts');
  assert.ok(existsSync(decl), 'dist/ambient.d.ts is part of the public surface');
  const text = readFileSync(decl, 'utf8');
  // A value import here would be a runtime edge from every app that references it.
  assert.match(text, /import type \{ EvaluationContext \}/);
  assert.equal(/^\s*import\s+(?!type)/m.test(text), false, 'no value imports');
  // …and nothing emitted a module to go with it.
  const emitted = readdirSync(dist).filter((f) => /^ambient\.(js|cjs|d\.cts|d\.js)$/.test(f));
  assert.deepEqual(emitted, [], `ambient.d.ts must ship as a declaration only, got ${emitted}`);
});
