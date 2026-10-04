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
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { LinkSpaceContext } from '../linkSpace';
import type { LinkSpace } from '../linkSpace';
import { TinkerableContext, type TinkerableState } from '../TinkerableContext';
import { parseHref } from '../urlUtils';
import { DEFAULT_MDX_COMPONENTS } from './MDXComponents';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const outerHref = 'https://local.immediately.run/edit/github/neumark/book/main/';
const state = {
  outerHref,
  navigationState: parseHref(outerHref),
} as TinkerableState;

const Anchor = DEFAULT_MDX_COMPONENTS.a;

const renderHref = (space: LinkSpace, href: string): string | null | undefined => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <TinkerableContext value={state}>
        <LinkSpaceContext value={space}>
          <Anchor href={href}>a note</Anchor>
        </LinkSpaceContext>
      </TinkerableContext>,
    );
  });
  const rendered = container.querySelector('a')?.getAttribute('href');
  act(() => {
    root.unmount();
    container.remove();
  });
  return rendered;
};

const BUNDLE_ROOT = '/repo/content';

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
