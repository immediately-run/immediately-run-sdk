/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { TinkerableContext } from './TinkerableContext';
import type { TinkerableState } from './TinkerableContext';
import type { FilesMetadata } from './sandboxTypes';
import { useAllMetadata, useFileMetadata, useMetadataQuery } from './hooks';

// Opt in to React's act(...) testing semantics for this jsdom suite.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Render a hook against a given metadata map and capture every value it returns,
// so we can assert both the result and how many distinct references it produced.
const renderHook = <R,>(useHook: () => R, files: FilesMetadata) => {
  const renders: R[] = [];
  const Probe = () => {
    renders.push(useHook());
    return null;
  };
  const container = document.createElement('div');
  const root = createRoot(container);
  const state = { filesMetadata: files } as TinkerableState;
  act(() => {
    root.render(
      <TinkerableContext value={state}>
        <Probe />
      </TinkerableContext>,
    );
  });
  const rerender = (next: FilesMetadata) => {
    const nextState = { filesMetadata: next } as TinkerableState;
    act(() => {
      root.render(
        <TinkerableContext value={nextState}>
          <Probe />
        </TinkerableContext>,
      );
    });
  };
  const unmount = () => act(() => root.unmount());
  return {
    renders,
    get last() {
      return renders[renders.length - 1];
    },
    rerender,
    unmount,
  };
};

interface PostMeta {
  title: string;
  draft?: boolean;
}

const files: FilesMetadata = {
  '/a.mdx': { title: 'A', draft: false },
  '/b.mdx': { title: 'B', draft: true },
  '/c.mdx': { title: 'C' },
};

describe('useMetadataQuery', () => {
  it('returns matching entries with their metadata, not just paths', () => {
    const h = renderHook(
      () =>
        useMetadataQuery<PostMeta>((m) =>
          Object.keys(m).filter((p) => !m[p].draft),
        ),
      files,
    );
    expect(h.last).toEqual([
      { path: '/a.mdx', meta: { title: 'A', draft: false } },
      { path: '/c.mdx', meta: { title: 'C' } },
    ]);
    h.unmount();
  });

  it('resolves synchronously on the first render (no null/empty frame)', () => {
    const h = renderHook(() => useMetadataQuery((m) => Object.keys(m)), files);
    // The very first captured value already has the results.
    expect(h.renders[0]).toHaveLength(3);
    h.unmount();
  });

  it('captures a throwing query as { error } instead of crashing', () => {
    const boom = new Error('bad query');
    const h = renderHook(
      () =>
        useMetadataQuery(() => {
          throw boom;
        }),
      files,
    );
    expect(h.last).toEqual({ error: boom });
    h.unmount();
  });

  it('keeps the result reference stable when the matches are unchanged', () => {
    const query = (m: FilesMetadata) => Object.keys(m).filter((p) => !m[p].draft);
    const h = renderHook(() => useMetadataQuery(query), files);
    const first = h.last;
    // A new map object whose matching entries are referentially identical.
    h.rerender({ ...files });
    expect(h.last).toBe(first);
    h.unmount();
  });

  it('produces a new reference when a matching entry changes', () => {
    const query = (m: FilesMetadata) => Object.keys(m).filter((p) => !m[p].draft);
    const h = renderHook(() => useMetadataQuery(query), files);
    const first = h.last;
    h.rerender({ ...files, '/a.mdx': { title: 'A2', draft: false } });
    expect(h.last).not.toBe(first);
    expect(h.last).toEqual([
      { path: '/a.mdx', meta: { title: 'A2', draft: false } },
      { path: '/c.mdx', meta: { title: 'C' } },
    ]);
    h.unmount();
  });
});

describe('useFileMetadata', () => {
  it('reads one file by path', () => {
    const h = renderHook(() => useFileMetadata<PostMeta>('/a.mdx'), files);
    expect(h.last).toEqual({ title: 'A', draft: false });
    h.unmount();
  });

  it('returns undefined for an unknown path', () => {
    const h = renderHook(() => useFileMetadata('/missing.mdx'), files);
    expect(h.last).toBeUndefined();
    h.unmount();
  });
});

describe('useAllMetadata', () => {
  it('returns the raw metadata map', () => {
    const h = renderHook(() => useAllMetadata(), files);
    expect(h.last).toBe(files);
    h.unmount();
  });
});
