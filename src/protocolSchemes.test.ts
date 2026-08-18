// Keying the map BY the wire name removed the mispairing failure mode at the type
// level — there is no second place to name a family, so `SCHEMES` cannot point
// `protocol-vcs` at the llm scheme. What is still worth pinning is the runtime
// derivation (`schemeOf` is a `slice` behind a cast) and the map's COVERAGE: a
// `protocol-*` name added to the contract and not added here has no call site that
// fails, it just has no scheme, and the omission is invisible until someone needs one.
import { SCHEMES } from './protocolSchemes';
import { WIRE_NAMES } from './generated/protocol';

describe('protocolSchemes', () => {
  it('derives each scheme from the wire name it is keyed by', () => {
    const entries = Object.entries(SCHEMES);
    expect(entries.length).toBeGreaterThan(10);
    for (const [wireName, scheme] of entries) {
      expect([wireName, `protocol-${scheme}`]).toEqual([wireName, wireName]);
    }
  });

  it('covers every protocol-* name the SDK speaks', () => {
    const spoken = Object.values(WIRE_NAMES)
      .filter((n) => n.startsWith('protocol-'))
      .sort();
    expect(Object.keys(SCHEMES).sort()).toEqual(spoken);
  });
});
