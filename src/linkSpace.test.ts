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
    expect(resolveLinkTarget('$fs:/app/content/intro.mdx', { corpusRoot: '/app/content' })).toEqual({
      state: 'resolved',
      path: '/app/content/intro.mdx',
    });
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

// ===========================================================================
// R3-319 / BL-2 exit criterion 4 — `$fs:` collapses to the scoped root under a
// bundle-chroot'd grant. `BUNDLE_LAYERS_SPEC §11` anchors that the SHIPPED
// resolver does not do this ("a bundle-anchored `$fs:` is an invariant to
// CREATE, not inherit"), so these are the tests that create it.
// ===========================================================================

describe('$fs: under a bundle chroot (BUNDLE_LAYERS_SPEC §9, R3-319)', () => {
  const CORPUS = '/repo/content';

  it('collapses: `$fs:/p` and `/p` resolve identically', () => {
    const opts = { corpusRoot: CORPUS, bundleChrooted: true };
    const viaFs = resolveLinkTarget(`${FS_PREFIX}/notes/a.md`, opts);
    const viaCorpus = resolveLinkTarget('/notes/a.md', opts);
    expect(viaFs).toEqual(viaCorpus);
    expect(viaFs).toEqual({ state: 'resolved', path: '/repo/content/notes/a.md' });
  });

  it('CONTROL: without the chroot the two spellings legitimately differ', () => {
    // The collapse must be caused by the chroot, not by the resolver having
    // quietly stopped distinguishing the two spellings everywhere.
    const opts = { corpusRoot: CORPUS };
    expect(resolveLinkTarget(`${FS_PREFIX}/notes/a.md`, opts)).toEqual({
      state: 'resolved',
      path: '/notes/a.md',
    });
    expect(resolveLinkTarget('/notes/a.md', opts)).toEqual({
      state: 'resolved',
      path: '/repo/content/notes/a.md',
    });
  });

  it('a chrooted `$fs:` cannot climb out of the bundle with `..`', () => {
    const opts = { corpusRoot: CORPUS, bundleChrooted: true };
    // The corpus-relative half is clamped BEFORE anchoring, so `..` at the top of
    // the bundle is the bundle root — never `/repo`, and never `/`.
    expect(resolveLinkTarget(`${FS_PREFIX}/../../../etc/passwd`, opts)).toEqual({
      state: 'resolved',
      path: '/repo/content/etc/passwd',
    });
    expect(resolveLinkTarget(`${FS_PREFIX}/notes/../../secrets`, opts)).toEqual({
      state: 'resolved',
      path: '/repo/content/secrets',
    });
  });

  it('still rejects a non-mount-absolute `$fs:` — the collapse opens no scheme hole', () => {
    const opts = { corpusRoot: CORPUS, bundleChrooted: true };
    expect(resolveLinkTarget(`${FS_PREFIX}javascript:alert(1)`, opts).state).toBe('invalid');
    expect(resolveLinkTarget(`${FS_PREFIX}https://evil.example`, opts).state).toBe('invalid');
    expect(resolveLinkTarget(`${FS_PREFIX}relative/x.md`, opts).state).toBe('invalid');
  });

  it('a chroot whose root IS the mount root is the identity case', () => {
    // When the bundle is the whole filesystem (no marker — value 3's no-op case)
    // the collapse is a no-op, which is what makes it safe to set the flag
    // unconditionally wherever the port is chroot'd.
    for (const corpusRoot of [null, '/'] as const) {
      const opts = { corpusRoot, bundleChrooted: true };
      expect(resolveLinkTarget(`${FS_PREFIX}/a/b.md`, opts)).toEqual({
        state: 'resolved',
        path: '/a/b.md',
      });
      expect(resolveLinkTarget('/a/b.md', opts)).toEqual({
        state: 'resolved',
        path: '/a/b.md',
      });
    }
  });

  it('relative targets are unaffected by the flag', () => {
    const opts = { currentFile: '/repo/content/notes/a.md', corpusRoot: CORPUS };
    expect(resolveLinkTarget('b.md', { ...opts, bundleChrooted: true })).toEqual(resolveLinkTarget('b.md', opts));
  });
});
