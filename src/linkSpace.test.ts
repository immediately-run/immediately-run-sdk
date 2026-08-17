// R3-273 link spaces — the shared resolver (linkSpace.ts). Pure path arithmetic:
// no DOM, no filesystem. The adversarial cases here are the roadmap item's exit
// criteria: traversal containment in BOTH spaces, scheme smuggling behind the
// `$fs:` prefix, and prefix look-alikes staying ordinary targets.

import { FS_PREFIX, normalizeAbsolute, resolveLinkTarget } from './linkSpace';

describe('normalizeAbsolute — closed under traversal', () => {
  it('collapses ./ and empty segments', () => {
    expect(normalizeAbsolute('/a//b/./c')).toBe('/a/b/c');
  });
  it('resolves .. within the tree', () => {
    expect(normalizeAbsolute('/a/b/../c')).toBe('/a/c');
  });
  it('clamps .. at the root — the root is its own parent', () => {
    expect(normalizeAbsolute('/../../etc/passwd')).toBe('/etc/passwd');
    expect(normalizeAbsolute('/..')).toBe('/');
  });
});

describe('resolveLinkTarget — default space', () => {
  it('absolute with no corpusRoot resolves from the fs root (legacy behavior)', () => {
    expect(resolveLinkTarget('/guide/setup.mdx')).toEqual({
      state: 'resolved',
      path: '/guide/setup.mdx',
    });
  });

  it('absolute with a corpusRoot resolves from the corpus root', () => {
    expect(resolveLinkTarget('/intro.mdx', { corpusRoot: '/app/content' })).toEqual({
      state: 'resolved',
      path: '/app/content/intro.mdx',
    });
  });

  it('corpus space is CLOSED: /.. clamps at the corpus root, never escapes into the mount', () => {
    expect(resolveLinkTarget('/../secrets.mdx', { corpusRoot: '/app/content' })).toEqual({
      state: 'resolved',
      path: '/app/content/secrets.mdx',
    });
    expect(resolveLinkTarget('/../../../x.mdx', { corpusRoot: '/app/content' })).toEqual({
      state: 'resolved',
      path: '/app/content/x.mdx',
    });
  });

  it('relative resolves against the authoring file in both spaces', () => {
    expect(
      resolveLinkTarget('../intro.mdx', {
        currentFile: '/app/content/guide/index.mdx',
        corpusRoot: '/app/content',
      }),
    ).toEqual({ state: 'resolved', path: '/app/content/intro.mdx' });
    expect(resolveLinkTarget('sibling.mdx', { currentFile: '/app/content/a.mdx' })).toEqual({
      state: 'resolved',
      path: '/app/content/sibling.mdx',
    });
  });

  it('relative with no authoring file is unresolvable (caller routes optimistically)', () => {
    expect(resolveLinkTarget('sibling.mdx')).toEqual({ state: 'unresolvable' });
  });
});

describe(`resolveLinkTarget — ${FS_PREFIX} space`, () => {
  it('resolves mount-absolute, ignoring any corpusRoot (the whole point)', () => {
    expect(
      resolveLinkTarget('$fs:/app/content/intro.mdx', { corpusRoot: '/app/content' }),
    ).toEqual({ state: 'resolved', path: '/app/content/intro.mdx' });
    expect(resolveLinkTarget('$fs:/mnt/abc/readme.md')).toEqual({
      state: 'resolved',
      path: '/mnt/abc/readme.md',
    });
  });

  it('traversal is clamped at the mount root', () => {
    expect(resolveLinkTarget('$fs:/../../etc/passwd')).toEqual({
      state: 'resolved',
      path: '/etc/passwd', // normalized; existence (and reach) is the mount's own
    });
  });

  it('a non-absolute remainder is INVALID — which fails every smuggled scheme closed', () => {
    expect(resolveLinkTarget('$fs:javascript:alert(1)')).toEqual({ state: 'invalid' });
    expect(resolveLinkTarget('$fs:https://evil.example/x')).toEqual({ state: 'invalid' });
    expect(resolveLinkTarget('$fs:relative/path.mdx')).toEqual({ state: 'invalid' });
    expect(resolveLinkTarget('$fs:')).toEqual({ state: 'invalid' });
  });

  it('prefix look-alikes are ordinary targets, not fs-space', () => {
    // Only the exact `$fs:` prefix switches space; near-misses stay default-space
    // relative targets (and resolve/break like any other path).
    expect(resolveLinkTarget('$FS:/x.mdx', { currentFile: '/app/a.mdx' })).toEqual({
      state: 'resolved',
      path: '/app/$FS:/x.mdx',
    });
    expect(resolveLinkTarget('x$fs:/y', { currentFile: '/app/a.mdx' })).toEqual({
      state: 'resolved',
      path: '/app/x$fs:/y',
    });
  });
});
