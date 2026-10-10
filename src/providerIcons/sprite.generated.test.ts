// The generated sprite's contract (R3-1141): the ids the catalogue keys on exist, the
// monochrome rule holds, and the size budget (160 KB raw) is enforced — over the real
// generated file, so a refresh that breaks any of it fails here.

import { PROVIDER_ICON_IDS, PROVIDER_ICON_SPRITE } from './sprite.generated';

describe('the generated provider-icon sprite', () => {
  it("carries the ids the host's catalogue keys on", () => {
    for (const id of ['anthropic', 'openrouter', 'zai-coding-plan']) {
      expect(PROVIDER_ICON_IDS).toContain(id);
      expect(PROVIDER_ICON_SPRITE).toContain(`id="pi-${id}"`);
    }
  });

  it('is monochrome — no fill or stroke other than currentColor/none, in attributes OR style', () => {
    // Both carriers: a presentation attribute and a style declaration (zenmux shipped
    // `style="fill:#f5f5f5;…"` upstream — inline style beats the attribute in the
    // cascade, so an attribute-only check passes over a brand-colored icon).
    const attrPaints = [...PROVIDER_ICON_SPRITE.matchAll(/(?:fill|stroke)="([^"]*)"/g)].map((m) => m[1]);
    const stylePaints = [...PROVIDER_ICON_SPRITE.matchAll(/style="([^"]*)"/g)].flatMap((m) =>
      [...m[1].matchAll(/(?:^|;)\s*(?:fill|stroke)\s*:\s*([^;]+)/g)].map((d) => d[1].trim()),
    );
    expect(attrPaints.length).toBeGreaterThan(0);
    for (const p of [...attrPaints, ...stylePaints]) expect(['currentColor', 'none']).toContain(p);
  });

  it('the zenmux regression: no style-carried paint survives the generator', () => {
    const zenmux = PROVIDER_ICON_SPRITE.match(/<symbol id="pi-zenmux"[\s\S]*?<\/symbol>/)?.[0] ?? '';
    expect(zenmux).not.toBe('');
    expect(zenmux).not.toContain('style=');
  });

  it('stays under the 160 KB raw budget (the subpath keeps it out of apps that never draw one)', () => {
    expect(PROVIDER_ICON_SPRITE.length).toBeLessThan(160 * 1024);
  });
});
