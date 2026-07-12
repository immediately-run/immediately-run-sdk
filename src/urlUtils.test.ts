import { constructOuterUrl, splitHash } from './urlUtils';
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
