// The bundle scope's path arithmetic (R3-174; MDX_FROM_MOUNT_SPEC §7 1a).
//
// The property under test is the one the mount prefix threatens: a path handed to a
// content component is bundle-absolute and IDENTICAL under every packaging, so a bundle
// addresses itself the same way whether it was forked, composed as a library, or
// dispatched into a host-minted chroot. The adversarial half is containment — a sibling
// mount whose path merely starts with the same characters is not inside this bundle.

import { fromBundlePath, toBundlePath } from './bundle';

const FORK = '/app/content';
const DISPATCH = '/mnt/ec1210aa4dfa0067260861b1eeb31a9b';

describe('toBundlePath', () => {
  it('rebases a fork path', () => {
    expect(toBundlePath('/app/content/roadmap/R3-174.mdx', FORK)).toBe('/roadmap/R3-174.mdx');
  });

  it('rebases a dispatch path to the SAME bundle address', () => {
    expect(toBundlePath(`${DISPATCH}/roadmap/R3-174.mdx`, DISPATCH)).toBe('/roadmap/R3-174.mdx');
  });

  it('tolerates a trailing slash on the root (the content-root convention carries one)', () => {
    expect(toBundlePath('/app/content/home.mdx', '/app/content/')).toBe('/home.mdx');
  });

  it('returns null outside a bundle rather than a wrong answer', () => {
    expect(toBundlePath('/app/src/App.tsx', FORK)).toBeNull();
    expect(toBundlePath('/app/content/x.mdx', null)).toBeNull();
  });

  it('does not treat a look-alike sibling mount as inside — separator boundary', () => {
    // `/mnt/<hash>` and `/mnt/<hash>2` are two different mounts. A bare `startsWith`
    // would put the second one's files inside the first one's bundle, which is how a
    // viewer ends up rendering a neighbouring mount's metadata as its own.
    expect(toBundlePath(`${DISPATCH}2/secret.mdx`, DISPATCH)).toBeNull();
  });

  it('does not treat the root itself as an entry', () => {
    expect(toBundlePath(DISPATCH, DISPATCH)).toBeNull();
  });
});

describe('fromBundlePath', () => {
  it('round-trips under both packagings', () => {
    for (const root of [FORK, DISPATCH]) {
      const absolute = `${root}/specs/PLATFORM_LAYERING_SPEC.mdx`;
      const bundlePath = toBundlePath(absolute, root);
      expect(bundlePath).toBe('/specs/PLATFORM_LAYERING_SPEC.mdx');
      expect(fromBundlePath(bundlePath as string, root)).toBe(absolute);
    }
  });

  it('accepts a path with no leading slash', () => {
    expect(fromBundlePath('home.mdx', FORK)).toBe('/app/content/home.mdx');
  });

  it('returns null without a root', () => {
    expect(fromBundlePath('/home.mdx', null)).toBeNull();
  });
});
