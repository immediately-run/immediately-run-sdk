import { defineConfig } from "tsup";

// Mirror of the SDK's shape for this tier: per-file transpile is NOT needed (the
// package is consumed through its root + re-exported by the SDK), so a single
// bundled ESM/CJS entry with declarations is the honest packaging. react and
// @immediately-run/mdx-plugins stay external: react is the universal peer, and
// mdx-plugins is the anti-drift coupling the extraction deliberately keeps
// (mdastDeps re-exports it so the compiled and interpreted paths share the
// grammar — PLATFORM_LAYERING_SPEC §4, R3-279).
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2020",
  external: ["react", "@immediately-run/mdx-plugins"],
});
