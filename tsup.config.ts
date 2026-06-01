import { defineConfig } from "tsup";

// `bundle: false` transpiles each source file 1:1 (like tsc), preserving the
// directory structure under dist/. This is required because consumers and the
// immediately.run sandbox runtime import via subpaths (e.g. "@immediately-run/sdk/boot",
// "@immediately-run/sdk/components/Include", "@immediately-run/sdk/MDXProvider") that are
// resolved against per-file URLs at runtime — a single bundled index.js would
// not expose those subpaths.
export default defineConfig({
  entry: ["src/**/*.ts", "src/**/*.tsx"],
  format: ["esm", "cjs"],
  bundle: false,
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2020",
  external: ["react", "react-dom", "react-error-boundary"],
});
