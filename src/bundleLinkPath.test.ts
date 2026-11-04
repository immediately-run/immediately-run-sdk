// R3-1324 — the bundle-link normaliser: an escaping href keeps its leading `..` segments
// (a URL would collapse them), an inside href is 'inside', a malformed escape is
// 'refused', and what is not a relative path is null.
import { bundleRelativeTarget } from './bundleLinkPath';

describe('bundleRelativeTarget', () => {
  it('keeps the leading .. of a link out of a top-level entry, and splits the fragment', () => {
    expect(bundleRelativeTarget('../spec/BATON_SPEC/06-x.md#r-btn-120', 'B-10.mdx')).toEqual({
      path: '../spec/BATON_SPEC/06-x.md',
      fragment: 'r-btn-120',
    });
  });

  it('resolves against the entry directory: ../../x.md from a/b.mdx leaves by one', () => {
    expect(bundleRelativeTarget('../../x.md', 'a/b.mdx')).toEqual({ path: '../x.md' });
  });

  it('a sibling stays inside', () => {
    expect(bundleRelativeTarget('c.mdx', 'a/b.mdx')).toBe('inside');
    expect(bundleRelativeTarget('../c.mdx#h', 'a/b.mdx')).toBe('inside');
  });

  it('a .. after a clean segment cancels it before counting as an escape', () => {
    expect(bundleRelativeTarget('a/../../x', 'b.mdx')).toEqual({ path: '../x' });
  });

  it('drops . and empty segments, keeps the normal form', () => {
    expect(bundleRelativeTarget('./..//./spec/./x.md', 'b.mdx')).toEqual({ path: '../spec/x.md' });
    expect(bundleRelativeTarget('../../a/../b', 'b.mdx')).toEqual({ path: '../../b' });
  });

  it('omits an empty fragment', () => {
    expect(bundleRelativeTarget('../x.md#', 'b.mdx')).toEqual({ path: '../x.md' });
  });

  it.each(['https://example.com/x', 'mailto:a@b.c', '#x', '', '//host/x', 'javascript:alert(1)', '$fs:/x'])(
    '%j is not a bundle link (null)',
    (href) => {
      expect(bundleRelativeTarget(href, 'a/b.mdx')).toBeNull();
    },
  );

  it('a root-absolute href clamps at the bundle root: inside', () => {
    expect(bundleRelativeTarget('/../../x', 'a/b.mdx')).toBe('inside');
  });

  it('refuses an encoded dot segment rather than guessing what the host will decode', () => {
    expect(bundleRelativeTarget('%2e%2e/x', 'b.mdx')).toBe('refused');
    expect(bundleRelativeTarget('../.%2E/x', 'b.mdx')).toBe('refused');
    expect(bundleRelativeTarget('a/%2e/b', 'b.mdx')).toBe('refused');
  });

  it('refuses an escape with a query or a second #, naming the reason', () => {
    const reasons: string[] = [];
    const onRefused = (r: string) => reasons.push(r);
    expect(bundleRelativeTarget('../x.md?y=1', 'b.mdx', onRefused)).toBe('refused');
    expect(bundleRelativeTarget('../x.md#a#b', 'B-10.mdx', onRefused)).toBe('refused');
    expect(bundleRelativeTarget('%2e%2e/x', 'b.mdx', onRefused)).toBe('refused');
    expect(reasons).toEqual([
      'it leaves the bundle with a query',
      'it leaves the bundle with a second #',
      'it has a percent-encoded dot segment',
    ]);
  });

  it('a query or a second # on a link that stays inside is routed as today', () => {
    expect(bundleRelativeTarget('c.mdx?y=1', 'a/b.mdx')).toBe('inside');
    expect(bundleRelativeTarget('c.mdx#a#b', 'a/b.mdx')).toBe('inside');
  });

  it('a fragment never carries a #', () => {
    for (const href of ['../x.md#a', '../x.md#a#', '../x.md##a', '../x.md#a#b#c']) {
      const out = bundleRelativeTarget(href, 'b.mdx');
      if (typeof out === 'object' && out !== null) expect(out.fragment ?? '').not.toContain('#');
    }
  });

  it('an entry that is not bundle-relative is not ours (null)', () => {
    expect(bundleRelativeTarget('../x.md', '../outside/b.mdx')).toBeNull();
  });

  it('resolves from the bundle-absolute entry form BundleEntry.path carries', () => {
    expect(bundleRelativeTarget('../../spec/x.md', '/tickets/B-10.mdx')).toEqual({ path: '../spec/x.md' });
    expect(bundleRelativeTarget('../c.mdx', '/tickets/B-10.mdx')).toBe('inside');
  });
});
