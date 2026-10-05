// Sibling coverage for ModuleCache's own cases: one promise per (base-module
// filepath, module name) key, for the whole life of the cache. The React-level
// half of the invariant — the identity survives every host push without an
// effect replay — lives in src/boot.suspenseReplay.test.tsx; this file pins the
// class itself (what makes a key, and that a hit never re-calls the producer).
import { ModuleCache } from './moduleCache';
import { createMockHost } from './testing';
import type { EvaluationContext } from './sandboxTypes';

// The constructor registers a COMPILE listener on the host transport, so the
// class cannot be instantiated outside a host realm; the mock stands in.
const host = createMockHost();
beforeEach(() => host.install());
afterEach(() => host.uninstall());

/** The EvaluationContext-shaped base a caller (FileRouter, an app module) passes. */
const baseModule = (filepath: string) =>
  ({
    evaluation: { module: { filepath } },
    resolve: async (name: string) => `${filepath}::${name}`,
    getModuleEvaluationContext: jest.fn(
      async (name: string) => ({ exports: { name } } as unknown as EvaluationContext),
    ),
  } as unknown as EvaluationContext & { getModuleEvaluationContext: jest.Mock });

describe('ModuleCache — one promise per key', () => {
  it('returns THE SAME promise for a repeated (base, name) pair and never re-calls the producer', () => {
    const base = baseModule('/node_modules/@immediately-run/sdk/components/FileRouter.js');
    const cache = new ModuleCache();
    const first = cache.getEvaluationContext('/app/src/App.tsx', base);
    const second = cache.getEvaluationContext('/app/src/App.tsx', base);
    // Identity, not just equality: `Include` hands this promise to `use()`,
    // and a fresh identity is the re-suspend/replay trigger.
    expect(second).toBe(first);
    expect(base.getModuleEvaluationContext).toHaveBeenCalledTimes(1);
  });

  it('keys on the module NAME: a different file gets its own evaluation', () => {
    const base = baseModule('/node_modules/@immediately-run/sdk/components/FileRouter.js');
    const cache = new ModuleCache();
    const a = cache.getEvaluationContext('/app/src/App.tsx', base);
    const b = cache.getEvaluationContext('/app/src/Other.tsx', base);
    expect(b).not.toBe(a);
    expect(base.getModuleEvaluationContext).toHaveBeenCalledTimes(2);
  });

  it('keys on the BASE module: the same name from a different importer gets its own evaluation', () => {
    const baseA = baseModule('/node_modules/@immediately-run/sdk/components/FileRouter.js');
    const baseB = baseModule('/app/src/pages/Home.tsx');
    const cache = new ModuleCache();
    const a = cache.getEvaluationContext('./Widget.tsx', baseA);
    const b = cache.getEvaluationContext('./Widget.tsx', baseB);
    expect(b).not.toBe(a);
    expect(baseA.getModuleEvaluationContext).toHaveBeenCalledTimes(1);
    expect(baseB.getModuleEvaluationContext).toHaveBeenCalledTimes(1);
  });

  it('memoises resolveModuleName the same way', () => {
    const base = baseModule('/app/src/App.tsx');
    const cache = new ModuleCache();
    const first = cache.resolveModuleName('./Widget.tsx', base);
    expect(cache.resolveModuleName('./Widget.tsx', base)).toBe(first);
    expect(cache.resolveModuleName('./Other.tsx', base)).not.toBe(first);
  });
});
