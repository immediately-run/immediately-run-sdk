import { defineConfig } from "tsup";

// `bundle: false` transpiles each source file 1:1 (like tsc), preserving the
// directory structure under dist/. This is required because consumers and the
// immediately.run sandbox runtime import via subpaths (e.g. "@immediately-run/sdk/boot",
// "@immediately-run/sdk/components/Include", "@immediately-run/sdk/MDXProvider") that are
// resolved against per-file URLs at runtime — a single bundled index.js would
// not expose those subpaths.
export default defineConfig({
  entry: [
    "src/**/*.ts",
    "src/**/*.tsx",
    "!src/**/*.test.ts",
    "!src/**/*.test.tsx",
    // `mdastDeps` is NOT a per-file passthrough: it's an internal build artifact that a
    // dedicated esbuild pass (`scripts/build-safecontent-deps.mjs`, run after tsup)
    // emits as a self-contained bundle so the sandbox resolver never walks the ESM-only
    // mdast/micromark conditional-exports tree (R3-213). Excluding it here keeps tsup
    // from emitting a bare-import version (which esbuild would have to overwrite) and
    // keeps it OUT of the public `.d.ts` API surface — it's internal, reached only by
    // `parseSafeMdast`'s relative `import('./mdastDeps')`, never as a public subpath.
    "!src/safeContent/mdastDeps.ts",
    // `ambient.d.ts` is a DECLARATION file, not a source file: tsup would emit it
    // as `ambient.d.cjs` / `ambient.d.d.cts`, which is neither loadable nor
    // referenceable. It is copied to dist verbatim by scripts/copy-ambient-types.mjs.
    "!src/ambient.d.ts",
  ],
  format: ["esm", "cjs"],
  bundle: false,
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2020",
  external: ["react", "react-dom", "react-error-boundary"],
});
