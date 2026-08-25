import { makeContentRef } from '../src/mounts';

describe('makeContentRef (plan 12 §E content references)', () => {
  it('produces the §5.7 capFile shape (one capability, two delivery modes)', () => {
    const ref = makeContentRef({ mountId: 'space:ACME', relPath: 'office-seating/desk.mdx' }, { mode: 'ro' });
    expect(ref).toEqual({
      $cap: 'file',
      mountId: 'space:ACME',
      relPath: 'office-seating/desk.mdx',
      mode: 'ro',
    });
  });

  it('carries the requested mode through (rw for an explicit cross-app write)', () => {
    expect(makeContentRef({ mountId: 'space:x', relPath: 'a/b.json' }, { mode: 'rw' }).mode).toBe('rw');
  });
});
