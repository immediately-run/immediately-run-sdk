import { compileTemplate, matchRoute, toRegExp } from './routeMatch';

describe('compileTemplate', () => {
  it('anchors a literal template and matches it exactly', () => {
    const re = compileTemplate('/');
    expect(re.source).toBe('^\\/$');
    expect('/'.match(re)).toBeTruthy();
    expect('/x'.match(re)).toBeNull();
  });

  it('captures :name as a single non-slash segment', () => {
    const re = compileTemplate('/posts/:slug');
    expect('/posts/intro'.match(re)?.groups).toEqual({ slug: 'intro' });
    expect('/posts/a/b'.match(re)).toBeNull(); // does not cross a slash
  });

  it('captures * as the greedy rest', () => {
    const re = compileTemplate('/files/*');
    expect('/files/a/b.mdx'.match(re)?.groups).toEqual({ wild: 'a/b.mdx' });
  });

  it('escapes regex-special literal characters', () => {
    const re = compileTemplate('/a.b');
    expect('/a.b'.match(re)).toBeTruthy();
    expect('/axb'.match(re)).toBeNull();
  });
});

describe('matchRoute', () => {
  it('returns named params, surfacing the wildcard under the * key', () => {
    expect(matchRoute('/posts/:slug', '/posts/intro')).toEqual({ slug: 'intro' });
    expect(matchRoute('/files/*', '/files/a/b.mdx')).toEqual({ '*': 'a/b.mdx' });
    expect(matchRoute('/', '/')).toEqual({});
  });

  it('returns null on no match', () => {
    expect(matchRoute('/posts/:slug', '/about')).toBeNull();
  });

  it('uses a RegExp as authored (the escape hatch)', () => {
    const params = matchRoute(/^\/files(?<filename>\/.+)$/, '/files/x.mdx');
    expect(params).toEqual({ filename: '/x.mdx' });
  });
});

describe('toRegExp', () => {
  it('passes a RegExp through unchanged and caches compiled templates', () => {
    const re = /^x$/;
    expect(toRegExp(re)).toBe(re);
    expect(toRegExp('/posts/:slug')).toBe(toRegExp('/posts/:slug'));
  });
});
