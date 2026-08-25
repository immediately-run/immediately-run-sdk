// R3-46 — runtime emission of the boot ir.* markers (LOAD_PROFILING_SPEC §3/§3.2).
import { emitMarker, emitMarkerOnce, __setMarkerDeps, __resetMarkers } from './markers';

describe('ir.* marker emission', () => {
  let sent: Array<{ type: string; data?: Record<string, unknown> }>;
  let clock: number;

  beforeEach(() => {
    __resetMarkers();
    sent = [];
    clock = 0;
    __setMarkerDeps({
      send: (type, data) => sent.push({ type, data }),
      now: () => clock,
    });
  });
  afterEach(() => __resetMarkers());

  it('forwards `ir-marker` with the name + emission timestamp', () => {
    clock = 123;
    emitMarker('ir.fmp');
    expect(sent).toEqual([{ type: 'ir-marker', data: { name: 'ir.fmp', at: 123 } }]);
  });

  it('includes attrs only when provided', () => {
    clock = 5;
    emitMarker('ir.interactive', { cold: true });
    expect(sent).toEqual([{ type: 'ir-marker', data: { name: 'ir.interactive', at: 5, attrs: { cold: true } } }]);
  });

  it('refuses to emit a name outside the ir.* vocabulary', () => {
    // @ts-expect-error — exercising the runtime guard with a bogus name
    emitMarker('ir.bogus');
    expect(sent).toEqual([]);
  });

  it('emitMarkerOnce emits a given name at most once (StrictMode-safe)', () => {
    clock = 1;
    emitMarkerOnce('ir.fmp');
    clock = 2;
    emitMarkerOnce('ir.fmp'); // ignored — already emitted
    clock = 3;
    emitMarkerOnce('ir.interactive'); // a different name still emits
    expect(sent).toEqual([
      { type: 'ir-marker', data: { name: 'ir.fmp', at: 1 } },
      { type: 'ir-marker', data: { name: 'ir.interactive', at: 3 } },
    ]);
  });

  it('swallows a transport error so a missing mark never breaks boot', () => {
    __setMarkerDeps({
      send: () => {
        throw new Error('transport not ready');
      },
      now: () => 0,
    });
    expect(() => emitMarker('ir.fmp')).not.toThrow();
  });
});
