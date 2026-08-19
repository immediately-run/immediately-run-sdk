/*
 * Path segments the outer-href parser has to accept.
 *
 * `PATH_SEGMENTS` used to ENUMERATE the allowed characters (`[a-zA-Z0-9-_]+`) rather than
 * say "one segment". That rejected three real shapes, and rejection here is not an error
 * — a whole-match failure makes `parsePath` return every field EMPTY, so an app's
 * navigation state silently goes blank with nothing logged. That is why these are worth
 * pinning: the symptom never points at the regex.
 *
 * The `%2F` case is the one that motivated the change (a git ref may contain `/`, and the
 * host now percent-encodes it so it survives as a single segment); the dotted tag and the
 * dotted repository name were already broken.
 */
import { parseHref, parsePath, constructUrl } from './urlUtils';

const HREF = (path: string) => `https://immediately.run${path}`;

describe('parsePath — a segment is anything but a slash', () => {
  it('parses an ordinary path (unchanged behaviour)', () => {
    expect(parsePath('/edit/github/ns/repo/main/files/src/App.tsx')).toMatchObject({
      mode: 'edit',
      provider: 'github',
      namespace: 'ns',
      repository: 'repo',
      ref: 'main',
      sandboxPath: '/files/src/App.tsx',
    });
  });

  it('parses a SEMVER TAG as the ref (was rejected: dot)', () => {
    expect(parsePath('/present/github/ns/repo/v1.2.3/files/a.tsx')).toMatchObject({
      ref: 'v1.2.3',
      sandboxPath: '/files/a.tsx',
    });
  });

  it('parses a DOTTED REPOSITORY name (was rejected: dot)', () => {
    expect(parsePath('/edit/github/ns/foo.js/main/files/a.tsx')).toMatchObject({
      repository: 'foo.js',
      ref: 'main',
    });
  });

  it('DECODES a percent-encoded ref back to the real ref', () => {
    // App code must never see the wire form — it compares refs against manifests and
    // binding ids, where the ref is `claude/x`, not `claude%2Fx`.
    expect(parsePath('/edit/github/ns/repo/claude%2FR3-43/files/a.tsx')).toMatchObject({
      ref: 'claude/R3-43',
      sandboxPath: '/files/a.tsx',
    });
  });

  it('a malformed escape degrades to the raw text instead of blanking everything', () => {
    // Untrusted input: `decodeURIComponent('%zz')` throws, and one bad ref must not take
    // out the whole navigation state.
    expect(parsePath('/edit/github/ns/repo/%zz/files/a.tsx')).toMatchObject({
      ref: '%zz',
      repository: 'repo',
    });
  });

  it('still parses a path with NO sandboxPath', () => {
    // `sandboxPath` is `'/'`, not `''` — the segment's existing transform prefixes a
    // slash, so an absent sub-path normalises to the root. Pre-existing behaviour,
    // asserted here so this test does not quietly become the place it changes.
    expect(parsePath('/edit/github/ns/repo/claude%2Fx')).toMatchObject({
      ref: 'claude/x',
      sandboxPath: '/',
    });
  });
});

describe('constructUrl ⇄ parseHref round trip', () => {
  it.each(['main', 'v1.2.3', 'claude/R3-43-m2-probe', 'feature/nested/deep'])(
    'ref %s survives parse → build → parse',
    (ref) => {
      const state = {
        mode: 'edit',
        provider: 'github',
        namespace: 'immediately-run',
        repository: 'agent-demo',
        ref,
        sandboxPath: '/files/src/App.tsx',
        search: '',
        hash: '',
      };
      const url = constructUrl(HREF('/edit/github/x/y/main/'), state);
      // The ref is written back ENCODED — otherwise a slash re-splits the segment and
      // the next parse loses it.
      expect(url).toContain(encodeURIComponent(ref));
      expect(parseHref(url)).toMatchObject({ ref, repository: 'agent-demo' });
    },
  );

  it('does NOT encode the sandbox path — its slashes are real', () => {
    const url = constructUrl(HREF('/edit/github/x/y/main/'), {
      mode: 'edit',
      provider: 'github',
      namespace: 'ns',
      repository: 'repo',
      ref: 'main',
      sandboxPath: '/files/src/App.tsx',
      search: '',
      hash: '',
    });
    expect(url).toContain('/files/src/App.tsx');
    expect(url).not.toContain('%2Ffiles');
  });

  it('an ordinary ref produces a byte-identical url to before', () => {
    // The compatibility claim: encoding is a no-op for every ref that already worked, so
    // this change cannot alter a URL any existing app is using.
    const url = constructUrl(HREF('/edit/github/x/y/main/'), {
      mode: 'present',
      provider: 'github',
      namespace: 'ns',
      repository: 'repo',
      ref: 'main',
      sandboxPath: '/files/a.tsx',
      search: '',
      hash: '',
    });
    expect(url).toBe('https://immediately.run/present/github/ns/repo/main/files/a.tsx');
  });
});
