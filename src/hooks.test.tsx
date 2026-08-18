/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { TinkerableContext } from './TinkerableContext';
import type { TinkerableState } from './TinkerableContext';
import type { FilesMetadata } from './sandboxTypes';
import { useAllMetadata, useFileMetadata, useMetadataQuery } from './hooks';
import { MetadataSource } from './metadataSource';

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

// ── R3-276 ───────────────────────────────────────────────────────────────────
// Records from queries, the app-rooted key space, and the MetadataSource provider
// that replaces re-provisioning `TinkerableContext` wholesale in app code.

/** Render inside a `MetadataSource`, with a host store behind it. */
const renderWithSource = <R,>(
  useHook: () => R,
  source: FilesMetadata,
  host: FilesMetadata = {},
  mode?: 'replace' | 'merge',
) => {
  const renders: R[] = [];
  const Probe = () => {
    renders.push(useHook());
    return null;
  };
  const container = document.createElement('div');
  const root = createRoot(container);
  const state = { filesMetadata: host } as TinkerableState;
  const render = (withSource: boolean) =>
    act(() => {
      root.render(
        <TinkerableContext value={state}>
          {withSource ? (
            <MetadataSource value={source} mode={mode}>
              <Probe />
            </MetadataSource>
          ) : (
            <Probe />
          )}
        </TinkerableContext>,
      );
    });
  render(true);
  return {
    renders,
    get last() {
      return renders[renders.length - 1];
    },
    /** Unmount the provider but keep rendering — "unregister". */
    dropSource: () => render(false),
    unmount: () => act(() => root.unmount()),
  };
};

describe('useMetadataQuery — record results (R3-276)', () => {
  it('carries the extra fields a record-returning query computed', () => {
    const h = renderHook(
      () =>
        useMetadataQuery<PostMeta, { upper: string }>((m) =>
          Object.keys(m)
            .filter((p) => !m[p].draft)
            .map((path) => ({ path, upper: m[path].title.toUpperCase() })),
        ),
      files,
    );
    expect(h.last).toEqual([
      { path: '/a.mdx', meta: files['/a.mdx'], upper: 'A' },
      { path: '/c.mdx', meta: files['/c.mdx'], upper: 'C' },
    ]);
  });

  it('does not let a record shadow `path` or `meta`', () => {
    // The hook owns those two. A query that happens to compute a field called
    // `meta` must not be able to hand the caller something that is not the
    // frontmatter — every downstream consumer reads `entry.meta`.
    const h = renderHook(
      () =>
        useMetadataQuery<PostMeta, { meta: string }>(() => [
          { path: '/a.mdx', meta: 'not the frontmatter' } as never,
        ]),
      files,
    );
    expect((h.last as { meta: unknown }[])[0].meta).toBe(files['/a.mdx']);
  });

  it('re-renders when only an extra field changed, and holds identity when nothing did', () => {
    // The extra fields are part of the result, so a change in them is a change —
    // but an unchanged result must keep its reference, or every downstream
    // dependency array fires on every render.
    let salt = 'x';
    const h = renderHook(
      () => useMetadataQuery<PostMeta, { salt: string }>(() => [{ path: '/a.mdx', salt }]),
      files,
    );
    const first = h.last;
    h.rerender(files);
    expect(h.last).toBe(first);
    salt = 'y';
    h.rerender({ ...files });
    expect(h.last).not.toBe(first);
    expect((h.last as { salt: string }[])[0].salt).toBe('y');
  });
});

describe('useFileMetadata — the key space is absolute (R3-276)', () => {
  const appRooted: FilesMetadata = { '/app/content/post.mdx': { title: 'Post' } };

  it('reads by the absolute module path the store is actually keyed by', () => {
    const h = renderHook(() => useFileMetadata('/app/content/post.mdx'), appRooted);
    expect(h.last).toEqual({ title: 'Post' });
  });

  it('accepts the repo-relative form the old doc told people to pass', () => {
    const h = renderHook(() => useFileMetadata('/content/post.mdx'), appRooted);
    expect(h.last).toEqual({ title: 'Post' });
  });

  it('still returns undefined for a path that is in neither space', () => {
    const h = renderHook(() => useFileMetadata('/content/missing.mdx'), appRooted);
    expect(h.last).toBeUndefined();
  });

  it('does not double-root an already-rooted miss', () => {
    // `/app/app/...` must never be consulted — a miss is a miss.
    const h = renderHook(
      () => useFileMetadata('/app/nope.mdx'),
      { '/app/app/nope.mdx': { title: 'wrong' } },
    );
    expect(h.last).toBeUndefined();
  });
});

describe('MetadataSource (R3-276)', () => {
  const host: FilesMetadata = { '/app/h.mdx': { title: 'Host' } };
  const provided: FilesMetadata = { '/corpus/x.mdx': { title: 'Provided' } };

  it('register: the hooks read the provided store instead of the host one', () => {
    const h = renderWithSource(() => useAllMetadata(), provided, host);
    expect(h.last).toEqual(provided);
  });

  it('query: a query runs against the provided store', () => {
    const h = renderWithSource(
      () => useMetadataQuery((m) => Object.keys(m)),
      provided,
      host,
    );
    expect(h.last).toEqual([{ path: '/corpus/x.mdx', meta: provided['/corpus/x.mdx'] }]);
  });

  it('replace (the default) hides the host entries — a different file space, not an addition', () => {
    const h = renderWithSource(() => useFileMetadata('/app/h.mdx'), provided, host);
    expect(h.last).toBeUndefined();
  });

  it('merge layers over what is in scope: unnamed paths still resolve outward', () => {
    const h = renderWithSource(() => useAllMetadata(), provided, host, 'merge');
    expect(h.last).toEqual({ ...host, ...provided });
  });

  it('unregister: unmounting the provider restores the host store', () => {
    const h = renderWithSource(() => useAllMetadata(), provided, host);
    expect(h.last).toEqual(provided);
    h.dropSource();
    expect(h.last).toEqual(host);
  });

  it('an app with no provider is unaffected — the host store is still the store', () => {
    const h = renderHook(() => useAllMetadata(), host);
    expect(h.last).toEqual(host);
  });
});
