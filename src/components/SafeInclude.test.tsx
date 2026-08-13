/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { createSourceCache } from '../sourceCache';
import { Include, IncludeModeContext } from './Include';
import { appMountRelative, stripFrontmatter } from './SafeInclude';

// The WIRING around the safe renderer: which renderer an `<Include>` resolves to, how a
// module path becomes mount-relative, what happens to frontmatter, and the read cache.
//
// The RENDER-LEVEL proof — that untrusted source reaches the DOM as data and nothing
// executes — is deliberately NOT here. `parseSafeMdast` dynamically imports ESM-only mdast
// deps that this repo's ts-jest (CJS) cannot load, which is why the safe renderer's headline
// guarantee is proven by `test/safeContent.e2e.mjs` under `node --test` on a built bundle.
// A render test placed here does not fail loudly — the dynamic import rejects, `SafeContent`
// catches it and renders its fallback, and the assertion sees an empty container. So it
// would look like a broken feature and would in fact be a broken harness.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const render = (ui: ReactNode) => {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(ui));
  return { container, unmount: () => act(() => root.unmount()) };
};

describe('Include mode selection', () => {
  it('defaults to compiled — every existing consumer is unaffected', () => {
    // No context, no prop: the compiled path runs and, with no ModuleCacheContext in scope,
    // fails on `moduleCache!.getEvaluationContext` exactly as it did before this change.
    // Asserting the THROW is what proves the default did not quietly move.
    expect(() => render(<Include filename="/app/content/x.mdx" />)).toThrow();
  });

  it('IncludeModeContext="interpreted" routes away from the module cache', () => {
    // Same missing ModuleCacheContext, no throw: the include never reached the compiled
    // branch. An interpreter app declares this ONCE at its root rather than remembering
    // `mode` at every call site — a forgotten one executes author code silently.
    expect(() =>
      render(
        <IncludeModeContext value="interpreted">
          <Include filename="/app/content/x.mdx" />
        </IncludeModeContext>,
      ),
    ).not.toThrow();
  });

  it('the `mode` prop overrides the context, in both directions', () => {
    // An interpreter app including one trusted, executable file of its own…
    expect(() =>
      render(
        <IncludeModeContext value="interpreted">
          <Include filename="/app/content/x.mdx" mode="compiled" />
        </IncludeModeContext>,
      ),
    ).toThrow();
    // …and a compiled app rendering one file it does not trust (Grove's proof-page shape).
    expect(() => render(<Include filename="/app/content/x.mdx" mode="interpreted" />)).not.toThrow();
  });
});

describe('stripFrontmatter', () => {
  it('removes a leading YAML block, as the compiled path does', () => {
    const src = ['---', 'title: Hidden', 'status: draft', '---', '', 'Visible body.'].join('\n');
    expect(stripFrontmatter(src)).toBe('\nVisible body.');
  });

  it('tolerates a BOM before the fence', () => {
    expect(stripFrontmatter('﻿---\ntitle: x\n---\nBody')).toBe('Body');
  });

  it('leaves a document with no frontmatter untouched', () => {
    expect(stripFrontmatter('# Title\n\nBody')).toBe('# Title\n\nBody');
  });

  it('does not eat a horizontal rule that merely looks like a fence', () => {
    // `---` as a thematic break mid-document must survive; only a LEADING block is
    // frontmatter, and swallowing to a later `---` would silently delete real prose.
    const src = '# Title\n\n---\n\nBody';
    expect(stripFrontmatter(src)).toBe(src);
  });
});

describe('appMountRelative', () => {
  it('makes an absolute module path mount-relative', () => {
    expect(appMountRelative('/app/content/x.mdx')).toBe('content/x.mdx');
  });

  it('leaves an already-relative path alone', () => {
    expect(appMountRelative('content/x.mdx')).toBe('content/x.mdx');
  });

  it('does not truncate a path that merely starts with the same letters', () => {
    // `/application/…` must not lose four characters to a naive `/app` prefix test.
    expect(appMountRelative('/application/x.mdx')).toBe('application/x.mdx');
  });
});

describe('createSourceCache', () => {
  it('memoises a read so `use()` sees one stable promise', async () => {
    const reader = jest.fn().mockResolvedValue('body');
    const cache = createSourceCache(reader);
    const a = cache.read('x.mdx');
    expect(cache.read('x.mdx')).toBe(a);
    expect(reader).toHaveBeenCalledTimes(1);
    await a;
  });

  it('EVICTS a rejected read, so a transient failure costs a retry and not the page', async () => {
    // The behaviour this cache exists for: the host RPC drops requests during a navigation,
    // and a memoised rejection is returned to every later render — the file then stays blank
    // for the rest of the session, with no error and no way back short of a reload.
    const reader = jest
      .fn()
      .mockRejectedValueOnce(new Error('Invalid RPC id'))
      .mockResolvedValueOnce('recovered');
    const cache = createSourceCache(reader);
    await expect(cache.read('x.mdx')).rejects.toThrow('Invalid RPC id');
    expect(cache.size()).toBe(0);
    await expect(cache.read('x.mdx')).resolves.toBe('recovered');
    expect(reader).toHaveBeenCalledTimes(2);
  });

  it('invalidate() drops one path, or all of them', async () => {
    const cache = createSourceCache(() => Promise.resolve('body'));
    await cache.read('a.mdx');
    await cache.read('b.mdx');
    expect(cache.size()).toBe(2);
    cache.invalidate('a.mdx');
    expect(cache.size()).toBe(1);
    cache.invalidate();
    expect(cache.size()).toBe(0);
  });
});
