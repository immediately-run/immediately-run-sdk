import { constructOuterUrl, splitHash, getOuterHostname, isInternalHref } from './urlUtils';
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
    const url = constructOuterUrl('https://localhost/present/github/acme/blog/main/about', '/specs/FOO.mdx#sec-8-9', nav);
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
    expect(
      isInternalHref(outer, 'http://localhost:3100/present/github/acme/blog/main/files/x.mdx', nav),
    ).toBe(true);
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
    expect(isInternalHref(outer, 'https://immediately.run/present/github/acme/blog/main/files/x.mdx', withHash)).toBe(true);
  });
});
