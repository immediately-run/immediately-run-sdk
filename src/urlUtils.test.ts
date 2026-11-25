import {
  acceptFilesHrefBase,
  appHrefFor,
  constructOuterUrl,
  constructUrl,
  displayHref,
  splitHash,
  getOuterHostname,
  isInternalHref,
  parseHref,
  platformHref,
} from './urlUtils';
import type { NavigationState } from './TinkerableContext';

const nav: NavigationState = {
  mode: 'present',
  provider: 'github',
  namespace: 'acme',
  repository: 'blog',
  ref: 'main',
  sandboxPath: '/about',
  hash: 'stale',
  search: '',
};

describe('splitHash (§13.5)', () => {
  it('splits a path#fragment target', () => {
    expect(splitHash('FOO.mdx#sec-8-9')).toEqual(['FOO.mdx', 'sec-8-9']);
  });
  it('a bare fragment has an empty path part', () => {
    expect(splitHash('#sec-3')).toEqual(['', 'sec-3']);
  });
  it('a target with no fragment keeps the whole string as the path', () => {
    expect(splitHash('FOO.mdx')).toEqual(['FOO.mdx', '']);
  });
  it('only the first # splits (a fragment never contains another #)', () => {
    expect(splitHash('a.mdx#one#two')).toEqual(['a.mdx', 'one#two']);
  });
  it('an empty target splits to two empty strings', () => {
    expect(splitHash('')).toEqual(['', '']);
  });
});

describe('constructOuterUrl — an absolute target carries its #fragment as the hash, not in the path', () => {
  it('folds the fragment into the outer URL hash, not the sandboxPath', () => {
    const url = constructOuterUrl(
      'https://localhost/present/github/acme/blog/main/about',
      '/specs/FOO.mdx#sec-8-9',
      nav,
    );
    // The fragment must land after `#`, and NOT be embedded in the /files path.
    expect(url).toContain('/files/specs/FOO.mdx');
    expect(url.endsWith('#sec-8-9')).toBe(true);
    expect(url).not.toContain('FOO.mdx%23');
    expect(url).not.toContain('FOO.mdx#sec-8-9/'); // fragment never becomes a path segment
  });
  it('an absolute target with no fragment clears a stale hash', () => {
    const url = constructOuterUrl('https://localhost/present/github/acme/blog/main/about', '/specs/FOO.mdx', nav);
    expect(url).not.toContain('#stale');
    expect(url).not.toContain('#');
  });
});

describe('getOuterHostname — the port is part of the origin', () => {
  it('keeps a non-default port', () => {
    // `url.hostname` drops it; `url.host` keeps it. Invisible on production and fatal to
    // every routed link under local dev on any port but 80.
    expect(getOuterHostname('http://localhost:3100/edit/local/x/y/live')).toBe('http://localhost:3100');
    expect(getOuterHostname('https://local.immediately.run:8443/present/github/a/b/main')).toBe(
      'https://local.immediately.run:8443',
    );
  });

  it('omits the DEFAULT port, so production URLs are unchanged', () => {
    // The whole reason this survived: on 443 `host` and `hostname` are identical.
    expect(getOuterHostname('https://immediately.run/present/github/a/b/main')).toBe('https://immediately.run');
    expect(getOuterHostname('https://immediately.run:443/present/github/a/b/main')).toBe('https://immediately.run');
    expect(getOuterHostname('http://example.com:80/x')).toBe('http://example.com');
  });
});

describe('isInternalHref — the port bug changed link BEHAVIOUR, not just the text', () => {
  const outer = 'http://localhost:3100/present/github/acme/blog/main/about';

  it('treats an absolute same-app URL as internal when a port is in play', () => {
    // With the port dropped, the prefix match failed, the href was classified EXTERNAL and
    // rendered as a plain <a> — clicking it navigated the sandboxed frame away instead of
    // routing, which looks exactly like "the app reloaded".
    expect(isInternalHref(outer, 'http://localhost:3100/present/github/acme/blog/main/files/x.mdx', nav)).toBe(true);
  });

  it('still treats a genuinely different origin as external', () => {
    expect(isInternalHref(outer, 'https://example.com/present/github/acme/blog/main/x', nav)).toBe(false);
    // Same host, different PORT is a different origin — it must not be routed in-app.
    expect(isInternalHref(outer, 'http://localhost:9999/present/github/acme/blog/main/x', nav)).toBe(false);
  });

  it('leaves a relative href alone', () => {
    expect(isInternalHref(outer, '/files/x.mdx', nav)).toBe(true);
  });
});

describe('repositoryPrefixURL — a page with a fragment must not break its own links', () => {
  it('clears hash and search, which belong to the CURRENT page and not to a prefix', () => {
    const withHash = { ...nav, hash: 'sec-8-9', search: 'q=1' };
    const outer = 'https://immediately.run/present/github/acme/blog/main/about';
    // Left in, these landed on the END of a prefix — so nothing could start with it.
    expect(isInternalHref(outer, 'https://immediately.run/present/github/acme/blog/main/files/x.mdx', withHash)).toBe(
      true,
    );
  });
});

describe('platformHref (R3-529) — a PLATFORM-space path resolves against the OUTER origin', () => {
  // The producer of outer hrefs feeds the consumer: the fixture is built by the SDK's own
  // constructUrl from a NavigationState, not hand-typed.
  const hostOuter = constructUrl('https://immediately.run', {
    ...nav,
    sandboxPath: '',
    hash: '',
    search: '',
  });

  it('resolves a root-relative platform path against the outer origin', () => {
    // The producer's real output: with an empty sandboxPath the segments join ends in `/`.
    expect(hostOuter).toBe('https://immediately.run/present/github/acme/blog/main/');
    expect(platformHref(hostOuter, '/home')).toBe('https://immediately.run/home');
  });

  it('keeps query and fragment of the PATH, not of the current page', () => {
    expect(platformHref(hostOuter, '/settings/language-model?x=1#sec')).toBe(
      'https://immediately.run/settings/language-model?x=1#sec',
    );
  });

  it('an absolute path is returned as-is', () => {
    expect(platformHref(hostOuter, 'https://example.com/elsewhere')).toBe('https://example.com/elsewhere');
  });

  it('an empty outerHref (vite dev — no host) returns the path unchanged', () => {
    expect(platformHref('', '/home')).toBe('/home');
  });

  it('an unresolvable pair returns the path rather than throwing', () => {
    expect(platformHref('not a url at all', '/home')).toBe('/home');
  });

  it('a non-string path throws', () => {
    expect(() => platformHref(hostOuter, 42 as unknown as string)).toThrow(TypeError);
  });
});

// R3-1397 — inside a bundle, the rendered href is the host's base + the in-bundle rest.
// The app-space URLs come from the real builder (`constructOuterUrl` over `parseHref`
// of a host-shaped outer URL), never hand-typed.
describe('displayHref / acceptFilesHrefBase (R3-1397)', () => {
  const PREFIX = 'https://immediately.run/present/github/immediately-run/baton/main/';
  const BASE = `${PREFIX}bundle/tickets/`;
  const at = (sandboxPath: string, filesHrefBase: string | null) => {
    const outerHref = `${PREFIX}${sandboxPath}`;
    return { outerHref, navigationState: parseHref(outerHref), filesHrefBase };
  };
  const shown = (target: string, state: ReturnType<typeof at>) =>
    displayHref(constructOuterUrl(state.outerHref, target, state.navigationState), state);

  it('maps a relative, an absolute, a fragment and a query target into the bundle', () => {
    const s = at('files/B-10.md', BASE);
    expect(shown('B-11.md', s)).toBe(`${BASE}B-11.md`);
    expect(shown('/projects/p.md', s)).toBe(`${BASE}projects/p.md`);
    expect(shown('B-11.md#r-1', s)).toBe(`${BASE}B-11.md#r-1`);
    expect(shown('#here', s)).toBe(`${BASE}B-10.md#here`);
    expect(shown('B-11.md?view=raw', s)).toBe(`${BASE}B-11.md?view=raw`);
  });

  it('maps the files home to the base itself', () => {
    const s = at('files/B-10.md', BASE);
    expect(displayHref(`${PREFIX}files`, s)).toBe(BASE);
    expect(displayHref(`${PREFIX}files/`, s)).toBe(BASE);
  });

  it('leaves a non-files app route, a files-lookalike segment and an external URL alone', () => {
    const s = at('files/B-10.md', BASE);
    expect(displayHref(`${PREFIX}settings`, s)).toBe(`${PREFIX}settings`);
    expect(displayHref(`${PREFIX}filesystem/x`, s)).toBe(`${PREFIX}filesystem/x`);
    expect(displayHref('https://example.com/files/x', s)).toBe('https://example.com/files/x');
  });

  it('with no base, every href is byte-identical to the app-space one', () => {
    const s = at('files/B-10.md', null);
    const app = constructOuterUrl(s.outerHref, 'B-11.md', s.navigationState);
    expect(displayHref(app, s)).toBe(app);
    expect(displayHref(app, { outerHref: s.outerHref, navigationState: s.navigationState })).toBe(app);
  });

  it('accepts a same-origin base ending in /, and refuses anything else loudly', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(acceptFilesHrefBase(BASE, PREFIX)).toBe(BASE);
    expect(acceptFilesHrefBase(undefined, PREFIX)).toBeNull();
    expect(acceptFilesHrefBase(null, PREFIX)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    for (const bad of [
      'https://evil.example/present/x/',
      `${PREFIX}bundle/tickets`,
      'bundle/tickets/',
      42,
      'javascript:alert(1)/',
    ]) {
      expect(acceptFilesHrefBase(bad, PREFIX)).toBeNull();
    }
    expect(warn).toHaveBeenCalledTimes(5);
    warn.mockRestore();
  });
});

// R3-1397 review rg:1-A-0: grove's link policy navigates with the anchor's REAL href
// (`e.currentTarget.href`, R3-1029), which inside a bundle is now the display address.
// `navigate()` maps it back through appHrefFor, the inverse of displayHref.
describe('appHrefFor — the inverse of displayHref (R3-1397)', () => {
  const PREFIX = 'https://immediately.run/present/github/immediately-run/baton/main/';
  const BASE = `${PREFIX}bundle/tickets/`;
  const at = (sandboxPath: string, filesHrefBase: string | null) => {
    const outerHref = `${PREFIX}${sandboxPath}`;
    return { outerHref, navigationState: parseHref(outerHref), filesHrefBase };
  };

  it('maps a rendered bundle href back to the app files/ URL, keeping ?search and #hash', () => {
    const s = at('files/B-10.md', BASE);
    expect(appHrefFor(`${BASE}B-11.md`, s)).toBe(`${PREFIX}files/B-11.md`);
    expect(appHrefFor(`${BASE}projects/p.md#r-1`, s)).toBe(`${PREFIX}files/projects/p.md#r-1`);
    expect(appHrefFor(BASE, s)).toBe(`${PREFIX}files`);
    expect(appHrefFor(`${BASE}?view=raw`, s)).toBe(`${PREFIX}files?view=raw`);
  });

  it('round-trips every app files/ href displayHref renders', () => {
    const s = at('files/B-10.md', BASE);
    for (const target of ['B-11.md', '/projects/p.md', 'B-11.md#r-1', '#here', 'B-11.md?view=raw', '/']) {
      const app = constructOuterUrl(s.outerHref, target, s.navigationState);
      const back = appHrefFor(displayHref(app, s), s);
      // `files/` and `files` share one display address (the base); both name the home.
      expect(back === app || (app.endsWith('/files/') && back === app.slice(0, -1))).toBe(true);
    }
  });

  it('leaves an app-space URL, an external URL and a lookalike prefix alone', () => {
    const s = at('files/B-10.md', BASE);
    expect(appHrefFor(`${PREFIX}files/B-11.md`, s)).toBe(`${PREFIX}files/B-11.md`);
    expect(appHrefFor('https://example.com/x', s)).toBe('https://example.com/x');
    expect(appHrefFor(`${PREFIX}bundle/tickets-old/x.md`, s)).toBe(`${PREFIX}bundle/tickets-old/x.md`);
    expect(appHrefFor(`${PREFIX}bundle/spec/x.md`, s)).toBe(`${PREFIX}bundle/spec/x.md`);
  });

  it('is the identity with no base', () => {
    expect(appHrefFor(`${BASE}B-11.md`, at('files/B-10.md', null))).toBe(`${BASE}B-11.md`);
  });
});
