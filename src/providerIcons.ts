// The bare subpath's entry (R3-1141 review round 1): `@immediately-run/sdk/providerIcons`
// resolves to dist/providerIcons.js — the `./*` exports map's `*` — so the component and
// the id set re-export through HERE, and the per-file passthrough build emits this file.
// A barrel only: the component and the sprite carry their own sibling tests.
export { ProviderIcon } from './providerIcons/ProviderIcon';
export type { ProviderIconProps } from './providerIcons/ProviderIcon';
export { PROVIDER_ICON_IDS } from './providerIcons/sprite.generated';
