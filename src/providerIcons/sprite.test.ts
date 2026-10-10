// The generated sprite's contract (R3-1141): the ids the catalogue keys on exist, the
// monochrome rule holds, and the size budget (160 KB raw) is enforced — over the REAL
// generated file, so a refresh that breaks any of it fails here.

import { PROVIDER_ICON_IDS, PROVIDER_ICON_SPRITE } from './sprite.generated';

describe('the generated provider-icon sprite', () => {
  it("carries the ids the host's catalogue keys on", () => {
    for (const id of ['anthropic', 'openrouter', 'zai-coding-plan']) {
      expect(PROVIDER_ICON_IDS).toContain(id);
      expect(PROVIDER_ICON_SPRITE).toContain(`id="pi-${id}"`);
    }
  });

  it('is monochrome — no fill or stroke other than currentColor/none', () => {
    const paints = [...PROVIDER_ICON_SPRITE.matchAll(/(?:fill|stroke)="([^"]*)"/g)].map((m) => m[1]);
    expect(paints.length).toBeGreaterThan(0);
    for (const p of paints) expect(['currentColor', 'none']).toContain(p);
  });

  it('stays under the 160 KB raw budget (the subpath keeps it out of apps that never draw one)', () => {
    expect(PROVIDER_ICON_SPRITE.length).toBeLessThan(160 * 1024);
  });
});
