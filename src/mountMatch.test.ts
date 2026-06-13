// The pure mount matcher behind findMount/waitForMount (R3-69). Covers the new
// `name` coordinate alongside the existing type/id/path, and the back-compat
// rule that an absent query field matches anything.
import { mountMatches, type MountMatchFields } from './mountMatch';

const mount: MountMatchFields = {
  type: 'firestore',
  id: 'space-abc',
  path: '/mnt/9f8e',
  name: 'Design notes',
};

describe('mountMatches', () => {
  it('matches an empty query (every field absent)', () => {
    expect(mountMatches(mount, {})).toBe(true);
  });

  it('matches by the human-readable name', () => {
    expect(mountMatches(mount, { name: 'Design notes' })).toBe(true);
    expect(mountMatches(mount, { name: 'Other' })).toBe(false);
  });

  it('still matches by type / id / path', () => {
    expect(mountMatches(mount, { type: 'firestore' })).toBe(true);
    expect(mountMatches(mount, { id: 'space-abc' })).toBe(true);
    expect(mountMatches(mount, { path: '/mnt/9f8e' })).toBe(true);
    expect(mountMatches(mount, { id: 'space-zzz' })).toBe(false);
  });

  it('requires every present field to match (AND, not OR)', () => {
    // name matches but id does not → no match.
    expect(mountMatches(mount, { name: 'Design notes', id: 'space-zzz' })).toBe(false);
    expect(mountMatches(mount, { name: 'Design notes', id: 'space-abc' })).toBe(true);
  });

  it('a name query does not match a mount that has no name', () => {
    const unnamed: MountMatchFields = { type: 'worktree', path: '/app' };
    expect(mountMatches(unnamed, { name: 'anything' })).toBe(false);
    // …but a coordinate query still works on an unnamed mount (back-compat).
    expect(mountMatches(unnamed, { type: 'worktree' })).toBe(true);
  });
});
