// ProviderIcon — the monochrome provider mark, keyed by models.dev provider id
// (R3-1141; the same key as the catalogue's `modelsDevId`).
//
// The sprite is vendored (scripts/sync-provider-icons.mjs → sprite.generated.ts):
// no runtime fetch — the CSP allows no external image host, and a refresh's diff is
// reviewable. Monochrome is enforced by the generator (every paint is currentColor or
// none), so the mark inherits the surrounding text color and no brand recoloring is
// possible. A provider with no icon keeps its lettermark — a guessed logo misrepresents
// the provider, which is worse than no logo.

import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { PROVIDER_ICON_IDS, PROVIDER_ICON_SPRITE } from './sprite.generated';

const SPRITE_NODE_ID = 'ir-provider-icon-sprite';

/** Inject the sprite once per document; a second renderer (or a remount) finds the
 *  existing node and adds nothing. */
const ensureSprite = (doc: Document): void => {
  if (doc.getElementById(SPRITE_NODE_ID)) return;
  const host = doc.createElement('div');
  host.id = SPRITE_NODE_ID;
  host.setAttribute('aria-hidden', 'true');
  host.style.display = 'none';
  host.innerHTML = PROVIDER_ICON_SPRITE;
  doc.body.appendChild(host);
};

export interface ProviderIconProps {
  /** The models.dev provider id (the sprite's symbol key). */
  id: string;
  /** The accessible name — and the lettermark's source when no icon exists. */
  label: string;
  /** Square edge in px. */
  size?: number;
}

export function ProviderIcon({ id, label, size = 16 }: ProviderIconProps): ReactNode {
  const known = (PROVIDER_ICON_IDS as readonly string[]).includes(id);
  // useEffect, not render: the injection is a side effect, and a second render must not
  // double-inject (the getElementById check is the idempotence, the effect is the rule).
  const docRef = useRef<Document | null>(null);
  if (typeof document !== 'undefined') docRef.current = document;
  useEffect(() => {
    if (known && docRef.current) ensureSprite(docRef.current);
  }, [known]);

  if (!known) {
    // The lettermark: the label's first letter, no invented mark.
    return (
      <span
        role="img"
        aria-label={label}
        style={{ display: 'inline-block', width: size, height: size, textAlign: 'center' }}
      >
        {label.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <svg role="img" aria-label={label} width={size} height={size}>
      <use href={`#pi-${id}`} />
    </svg>
  );
}
