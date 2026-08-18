// The derived schemes are type-level, so TypeScript proves each one is the tail of
// SOME `protocol-*` name. What it cannot prove is that each is the tail of the RIGHT
// one — `SCHEME_VCS = schemeOf(PROTOCOL_LLM)` type-checks happily and would send every
// vcs call to the llm handler. That mispairing is the only failure mode this module
// has, so it is the thing worth a test.
import * as schemes from './protocolSchemes';
import * as protocol from './generated/protocol';

describe('protocolSchemes', () => {
  const derived = Object.entries(schemes).filter(([name]) => name.startsWith('SCHEME_'));

  it('pairs every scheme with the wire name of the same family', () => {
    expect(derived.length).toBeGreaterThan(10);
    for (const [name, value] of derived) {
      const wireName = (protocol as Record<string, unknown>)[name.replace('SCHEME_', 'PROTOCOL_')];
      expect([name, wireName]).toEqual([name, `protocol-${value as string}`]);
    }
  });

  it('covers every protocol-* name the SDK speaks', () => {
    const wireSchemes = Object.values(protocol.WIRE_NAMES)
      .filter((n) => n.startsWith('protocol-'))
      .map((n) => n.slice('protocol-'.length))
      .sort();
    expect(derived.map(([, v]) => v as string).sort()).toEqual(wireSchemes);
  });
});
