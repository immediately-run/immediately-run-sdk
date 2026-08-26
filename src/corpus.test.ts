// The corpus scope's path arithmetic (R3-174; MDX_FROM_MOUNT_SPEC §7 1a).
//
// The property under test is the one the mount prefix threatens: a path handed to a
// content component is corpus-absolute and IDENTICAL under every packaging, so a corpus
// addresses itself the same way whether it was forked, composed as a library, or
// dispatched into a host-minted chroot. The adversarial half is containment — a sibling
// mount whose path merely starts with the same characters is not inside this corpus.

import { fromCorpusPath, toCorpusPath } from './corpus';

const FORK = '/app/content';
const DISPATCH = '/mnt/ec1210aa4dfa0067260861b1eeb31a9b';

describe('toCorpusPath', () => {
  it('rebases a fork path', () => {
    expect(toCorpusPath('/app/content/roadmap/R3-174.mdx', FORK)).toBe('/roadmap/R3-174.mdx');
  });

  it('rebases a dispatch path to the SAME corpus address', () => {
    expect(toCorpusPath(`${DISPATCH}/roadmap/R3-174.mdx`, DISPATCH)).toBe('/roadmap/R3-174.mdx');
  });

  it('tolerates a trailing slash on the root (the content-root convention carries one)', () => {
    expect(toCorpusPath('/app/content/home.mdx', '/app/content/')).toBe('/home.mdx');
  });

  it('returns null outside a corpus rather than a wrong answer', () => {
    expect(toCorpusPath('/app/src/App.tsx', FORK)).toBeNull();
    expect(toCorpusPath('/app/content/x.mdx', null)).toBeNull();
  });

  it('does not treat a look-alike sibling mount as inside — separator boundary', () => {
    // `/mnt/<hash>` and `/mnt/<hash>2` are two different mounts. A bare `startsWith`
    // would put the second one's files inside the first one's corpus, which is how a
    // viewer ends up rendering a neighbouring mount's metadata as its own.
    expect(toCorpusPath(`${DISPATCH}2/secret.mdx`, DISPATCH)).toBeNull();
  });

  it('does not treat the root itself as an entry', () => {
    expect(toCorpusPath(DISPATCH, DISPATCH)).toBeNull();
  });
});

describe('fromCorpusPath', () => {
  it('round-trips under both packagings', () => {
    for (const root of [FORK, DISPATCH]) {
      const absolute = `${root}/specs/PLATFORM_LAYERING_SPEC.mdx`;
      const corpus = toCorpusPath(absolute, root);
      expect(corpus).toBe('/specs/PLATFORM_LAYERING_SPEC.mdx');
      expect(fromCorpusPath(corpus as string, root)).toBe(absolute);
    }
  });

  it('accepts a path with no leading slash', () => {
    expect(fromCorpusPath('home.mdx', FORK)).toBe('/app/content/home.mdx');
  });

  it('returns null without a root', () => {
    expect(fromCorpusPath('/home.mdx', null)).toBeNull();
  });
});
