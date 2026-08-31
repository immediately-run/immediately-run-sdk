// R3-482 — the deprecated `Corpus*` alias surface (`./corpus`) is the SAME bindings as
// `./bundle`, not a parallel copy.
//
// This is the one property the alias exists to hold, and the one a future edit could
// silently break: re-declaring `CorpusContext` with its own `createContext` would type-
// check, publish, and pass every other test — while making a provider written as
// `<CorpusContext>` invisible to `useBundle`, and vice versa. React context identity is
// object identity, so an app mid-migration (old provider, new hook) would read the empty
// default and render nothing, with no error anywhere.
//
// Delete this file with the aliases at cutover.

import * as bundle from './bundle';
import * as corpus from './corpus';
import * as root from './index';

describe('the Corpus* aliases are re-exports, never re-declarations', () => {
  it('binds each old name to the very same object as its new name', () => {
    expect(corpus.CorpusContext).toBe(bundle.BundleContext);
    expect(corpus.useCorpus).toBe(bundle.useBundle);
    expect(corpus.useCorpusEntries).toBe(bundle.useBundleEntries);
    expect(corpus.useCorpusEntry).toBe(bundle.useBundleEntry);
    expect(corpus.toCorpusPath).toBe(bundle.toBundlePath);
    expect(corpus.fromCorpusPath).toBe(bundle.fromBundlePath);
  });

  it('agrees across the package root too — one context, two spellings', () => {
    expect(root.CorpusContext).toBe(root.BundleContext);
    expect(root.useCorpus).toBe(root.useBundle);
  });

  it('keeps `useCurrentEntry` on the ./corpus subpath (it was never renamed)', () => {
    // `@immediately-run/sdk/corpus` is a real subpath via the `./*` export wildcard, so
    // dropping an unrelated name from it would still shrink that module's public surface.
    expect(corpus.useCurrentEntry).toBe(bundle.useCurrentEntry);
  });

  it('behaves identically when called through the old spelling', () => {
    expect(corpus.toCorpusPath('/mnt/h/x.mdx', '/mnt/h')).toBe('/x.mdx');
    expect(corpus.fromCorpusPath('/x.mdx', '/mnt/h')).toBe('/mnt/h/x.mdx');
  });
});
