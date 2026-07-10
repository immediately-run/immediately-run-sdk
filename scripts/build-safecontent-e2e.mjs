// Bundle `src/safeContent` into ONE self-contained ESM file for the end-to-end
// `node --test` proof (`test/safeContent.e2e.mjs`). The shipped SDK is built
// `bundle:false` (extensionless internal imports, resolved by the sandbox's lenient
// resolver — but not by Node's native ESM), so the e2e can't import the dist directly.
// This bundles the local module graph into one file while keeping `react` and the
// ESM-only parser deps EXTERNAL (Node resolves them from node_modules; the dynamic
// `import()` of the parser deps is preserved). Output is gitignored test scaffolding.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

await build({
  entryPoints: [join(root, 'src/safeContent/index.ts')],
  outfile: join(root, 'test/.artifacts/safeContent.bundle.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  jsx: 'automatic',
  // Keep react + the ESM parser deps external — Node resolves them; the parser deps
  // stay dynamically imported (proving the real no-acorn pipeline runs).
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    'mdast-util-from-markdown',
    'micromark-extension-mdx-jsx',
    'mdast-util-mdx-jsx',
    'micromark-extension-gfm',
    'mdast-util-gfm',
  ],
  logLevel: 'warning',
});

console.log('Built test/.artifacts/safeContent.bundle.mjs');
