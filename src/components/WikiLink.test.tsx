/**
 * @jest-environment jsdom
 */
// R3-783 — WikiLink forwards the LinkSpaceContext's `bundleChrooted` flag to the
// shared resolver (BUNDLE_LAYERS_SPEC §9). Before this item the flag was
// decided-but-not-consumed on the SDK's generic path: the provider set it and
// WikiLink forwarded only the root, so a `$fs:` wikilink under a bundle-chroot'd
// grant still resolved mount-absolute. These tests pin BOTH directions: under
// `bundleChrooted: true` a `$fs:` link resolves bundle-anchored — identical to
// the ordinary spelling (the R3-319 invariant) — and the default
// (`false`/absent) keeps the mount-absolute reading.
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { LinkSpaceContext } from '../linkSpace';
import type { LinkSpace } from '../linkSpace';
import { TinkerableContext, type TinkerableState } from '../TinkerableContext';
import { parseHref } from '../urlUtils';
import { WikiLink } from './WikiLink';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const outerHref = 'https://local.immediately.run/edit/github/neumark/book/main/';
const state = {
  outerHref,
  navigationState: parseHref(outerHref),
  // No filesMetadata: an unloaded store is optimistic, so a resolved target
  // renders as a link (never flashes "broken") — existence is not what these
  // tests pin.
} as TinkerableState;

const renderHref = (space: LinkSpace, target: string): string | null | undefined => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <TinkerableContext value={state}>
        <LinkSpaceContext value={space}>
          <WikiLink target={target} />
        </LinkSpaceContext>
      </TinkerableContext>,
    );
  });
  const href = container.querySelector('a')?.getAttribute('href');
  act(() => {
    root.unmount();
    container.remove();
  });
  return href;
};

const BUNDLE_ROOT = '/repo/content';

describe('WikiLink — bundleChrooted forwarding (R3-783)', () => {
  it('under `bundleChrooted: true` a `$fs:` link resolves bundle-anchored', () => {
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
