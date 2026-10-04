/**
 * @jest-environment jsdom
 */
// R3-783 — the markdown `a` override forwards the LinkSpaceContext's
// `bundleChrooted` flag to the shared resolver (BUNDLE_LAYERS_SPEC §9), the twin
// of WikiLink's read. Before this item the flag was decided-but-not-consumed on
// the SDK's generic path, so a `$fs:` markdown link under a bundle-chroot'd
// grant still resolved mount-absolute. Both directions pinned: chrooted
// collapses `$fs:` to the scoped root (identical to the ordinary spelling); the
// default keeps the mount-absolute reading.
import type { LinkSpace } from '../linkSpace';
import { renderWithLinkSpace } from '../../test/renderLinkSpace';
import { DEFAULT_MDX_COMPONENTS } from './MDXComponents';

const Anchor = DEFAULT_MDX_COMPONENTS.a;

const BUNDLE_ROOT = '/repo/content';

const renderHref = (space: LinkSpace, href: string): string | null | undefined => {
  const r = renderWithLinkSpace(<Anchor href={href}>a note</Anchor>, { space });
  const rendered = r.href();
  r.unmount();
  return rendered;
};

describe('MDXComponents `a` — bundleChrooted forwarding (R3-783)', () => {
  it('under `bundleChrooted: true` a `$fs:` href resolves bundle-anchored', () => {
    const space: LinkSpace = { bundleRoot: BUNDLE_ROOT, bundleChrooted: true };
    const href = renderHref(space, '$fs:/notes/a.md');
    expect(href).toContain('/repo/content/notes/a.md');
  });

  it('… identical to the ordinary spelling (the R3-319 invariant)', () => {
    const space: LinkSpace = { bundleRoot: BUNDLE_ROOT, bundleChrooted: true };
    expect(renderHref(space, '$fs:/notes/a.md')).toEqual(renderHref(space, '/notes/a.md'));
  });

  it('DEFAULT (flag absent): `$fs:` stays mount-absolute, escaping the bundle', () => {
    const space: LinkSpace = { bundleRoot: BUNDLE_ROOT };
    const href = renderHref(space, '$fs:/notes/a.md');
    expect(href).toContain('/notes/a.md');
    expect(href).not.toContain('/repo/content');
  });

  it('explicit `bundleChrooted: false` behaves like the absent default', () => {
    const flagged = renderHref({ bundleRoot: BUNDLE_ROOT, bundleChrooted: false }, '$fs:/notes/a.md');
    const absent = renderHref({ bundleRoot: BUNDLE_ROOT }, '$fs:/notes/a.md');
    expect(flagged).toEqual(absent);
    expect(flagged).not.toContain('/repo/content');
  });
});
