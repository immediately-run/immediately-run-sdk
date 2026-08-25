// R3-46 — the ir.* vocabulary allowlist + the ir.interactive precedence rule
// (LOAD_PROFILING_SPEC §3/§3.1, LP-5 + LP2-3). The two required adversarial cases.
import { validateMarker, resolveInteractive, isAllowedMarkerName, IR_MARKERS } from './irMarkers';

describe('validateMarker — the LP-5 host vocabulary allowlist', () => {
  it('accepts a defined marker with in-schema attributes', () => {
    const m = { name: 'ir.fetch', at: 12.5, attrs: { source: 'zip', bytes: 1024 } };
    expect(validateMarker(m)).toEqual(m);
  });

  it('accepts a bare defined mark with no attrs', () => {
    expect(validateMarker({ name: 'ir.fmp', at: 1 })).toEqual({ name: 'ir.fmp', at: 1 });
  });

  it('accepts a recognized per-module/per-dep sub-mark, inheriting the aggregate schema', () => {
    expect(validateMarker({ name: 'ir.transpile.mod[/src/App.tsx]', at: 2, attrs: { moduleCount: 1 } })).toEqual({
      name: 'ir.transpile.mod[/src/App.tsx]',
      at: 2,
      attrs: { moduleCount: 1 },
    });
    expect(validateMarker({ name: 'ir.deps.pkg[react@18.2.0]', at: 3, attrs: { bytes: 9 } })).toEqual({
      name: 'ir.deps.pkg[react@18.2.0]',
      at: 3,
      attrs: { bytes: 9 },
    });
  });

  // The adversarial core: an untrusted sandbox must not mint arbitrary names/values
  // into the host timeline.
  it("DROPS an unknown marker name (a sandbox can't invent vocabulary)", () => {
    expect(validateMarker({ name: 'ir.evil', at: 1 })).toBeNull();
    expect(validateMarker({ name: 'ir.fetch.evil', at: 1 })).toBeNull(); // not a defined sub-mark form
    expect(validateMarker({ name: 'totally.made.up', at: 1, attrs: { x: 1 } })).toBeNull();
  });

  it('DROPS a defined marker carrying an out-of-schema attribute (no smuggled payload)', () => {
    // ir.fetch's schema has no `evil` key → the whole marker is dropped, not trimmed.
    expect(validateMarker({ name: 'ir.fetch', at: 1, attrs: { source: 'zip', evil: '<script>' } })).toBeNull();
    // ir.fmp takes NO attributes at all.
    expect(validateMarker({ name: 'ir.fmp', at: 1, attrs: { cold: true } })).toBeNull();
  });

  it('DROPS structurally invalid markers (missing/non-finite timestamp, bad shape)', () => {
    expect(validateMarker(null)).toBeNull();
    expect(validateMarker({ name: 'ir.fmp', at: Number.NaN })).toBeNull();
    expect(validateMarker({ name: 'ir.fmp', at: Infinity })).toBeNull();
    // @ts-expect-error — exercising a malformed payload from the wire
    expect(validateMarker({ name: 'ir.fmp' })).toBeNull();
    // @ts-expect-error — non-object attrs
    expect(validateMarker({ name: 'ir.fmp', at: 1, attrs: 'nope' })).toBeNull();
  });

  it('every vocabulary name is itself an allowed name (table ↔ predicate agree)', () => {
    for (const name of Object.keys(IR_MARKERS)) {
      expect(isAllowedMarkerName(name)).toBe(true);
    }
    expect(isAllowedMarkerName('ir.nope')).toBe(false);
  });
});

describe('resolveInteractive — ir.interactive = max(commit, reportReady) (LP2-3)', () => {
  it('uses the commit alone when the app never reports', () => {
    expect(resolveInteractive(100)).toBe(100);
  });

  it('DELAYS interactive when reportReady fires after the commit', () => {
    expect(resolveInteractive(100, 150)).toBe(150);
  });

  // The spoofed-early-interactive case: a reportReady() BEFORE the root-render
  // commit cannot advance interactive — it binds to the later commit, so an app
  // can't declare itself ready before it has rendered anything.
  it('CANNOT advance interactive before the root-render commit (spoofed-early-ready)', () => {
    expect(resolveInteractive(100, 40)).toBe(100); // early report is ignored for the bound
    expect(resolveInteractive(100, 0)).toBe(100);
  });
});
