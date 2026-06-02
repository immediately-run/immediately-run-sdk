import { parseHref, constructOuterUrl } from '../src/urlUtils'

const URL_PREFIX = 'https://tinkerable-site.local.peterneumark.com/present/github/immediately-run/vibe-blog/published';

describe('parseHref', function () {

  it('basic cases', async () => {
    expect(
      parseHref(`${URL_PREFIX}/files/App.tsx`)
    ).toEqual({
      "mode": "present",
      "provider": "github",
      "namespace": "immediately-run",
      "repository": "vibe-blog",
      "ref": "published",
      "sandboxPath": "/files/App.tsx",
      "search": "",
      "hash": ""
    });

    expect(
      parseHref(`${URL_PREFIX}/files/App.tsx?a=b`)
    ).toEqual({
      "mode": "present",
      "provider": "github",
      "namespace": "immediately-run",
      "repository": "vibe-blog",
      "ref": "published",
      "sandboxPath": "/files/App.tsx",
      "search": "a=b",
      "hash": ""
    });

    expect(
      parseHref(`${URL_PREFIX}/files/App.tsx#foo`)
    ).toEqual({
      "mode": "present",
      "provider": "github",
      "namespace": "immediately-run",
      "repository": "vibe-blog",
      "ref": "published",
      "sandboxPath": "/files/App.tsx",
      "search": "",
      "hash": "foo"
    });

    expect(
      parseHref(`${URL_PREFIX}/files/App.tsx?a=b#foo`)
    ).toEqual({
      "mode": "present",
      "provider": "github",
      "namespace": "immediately-run",
      "repository": "vibe-blog",
      "ref": "published",
      "sandboxPath": "/files/App.tsx",
      "search": "a=b",
      "hash": "foo"
    });
  });

  it('parses the repository root with or without a trailing slash', async () => {
    // A short `/:mode/.../:repository` URL redirects to `.../<ref>` with no
    // trailing slash. The trailing sandboxPath group must be optional, else the
    // regex matches nothing and every segment comes back empty — which produced
    // the `//////files/...` garbage URL this guards against.
    const expected = {
      "mode": "present",
      "provider": "github",
      "namespace": "immediately-run",
      "repository": "vibe-blog",
      "ref": "published",
      "sandboxPath": "/",
      "search": "",
      "hash": ""
    };
    // No trailing slash after the ref (the regression).
    expect(parseHref(URL_PREFIX)).toEqual(expected);
    // Trailing slash, no sub-path.
    expect(parseHref(`${URL_PREFIX}/`)).toEqual(expected);
  });

});

const defaultOuterHref = `${URL_PREFIX}/files/App.tsx`;

const relative = (url: string, outerHref = defaultOuterHref, addFilesPrefix?: boolean) => {
  const navigationState = parseHref(outerHref);
  return constructOuterUrl(
    outerHref,
    url,
    navigationState,
    addFilesPrefix
  )
};

describe('constructOuterUrl', function () {
  it('relative path in same dir', async () => {
    expect(relative('./index.tsx')).toEqual(`${URL_PREFIX}/files/index.tsx`);
    expect(relative('index.tsx')).toEqual(`${URL_PREFIX}/files/index.tsx`);
  });

  it('relative path in subdir', async () => {
    expect(
      relative('./subdir/index.tsx')
    ).toEqual(`${URL_PREFIX}/files/subdir/index.tsx`);
  });

  it('relative path above root', async () => {
    expect(
      relative('../../../index.tsx')
      // note that this navigation request will not be allowed by the outer iframe, but as far as the absolute
      // URl constuction goes, this is what we expect.
    ).toEqual("https://tinkerable-site.local.peterneumark.com/present/github/immediately-run/index.tsx");
  });

  it('relative to a directory', async () => {
    expect(
      relative(
        'index.tsx',
        `${URL_PREFIX}/files/subdir/`
      )
    ).toEqual(`${URL_PREFIX}/files/subdir/index.tsx`);
  });

  it('relative directory', async () => {
    expect(
      relative(
        '../datadir/',
        `${URL_PREFIX}/files/subdir/somefile.mdx`
      )
    ).toEqual(`${URL_PREFIX}/files/datadir/`);
  });

  it('relative path in parent dir', async () => {
    expect(
      relative(
        '../index.tsx',
        `${URL_PREFIX}/files/subdir1/subdir2/index.tsx`
      )
    ).toEqual(`${URL_PREFIX}/files/subdir1/index.tsx`);
  });

  it('absolute path with added files prefix', async () => {
    expect(
      relative(
        '/index.tsx',
        `${URL_PREFIX}/files/subdir1/subdir2/index.tsx`
      )
    ).toEqual(`${URL_PREFIX}/files/index.tsx`);
  });

  it('absolute path without added files prefix', async () => {
    expect(
      relative(
        '/somedir/index.tsx',
        `${URL_PREFIX}/files/subdir1/subdir2/index.tsx`,
        false
      )
    ).toEqual(`${URL_PREFIX}/somedir/index.tsx`);
  });

  it('relative path with query params', async () => {
    expect(
      relative('./subdir/index.tsx?foo=bar')
    ).toEqual(`${URL_PREFIX}/files/subdir/index.tsx?foo=bar`);
  });

  it('relative path with hash', async () => {
    expect(
      relative('./subdir/index.tsx#foobar')
    ).toEqual(`${URL_PREFIX}/files/subdir/index.tsx#foobar`);
  });

  it('relative path only hash', async () => {
    expect(
      relative('#foobar')
    ).toEqual(`${defaultOuterHref}#foobar`);
  });

  it('relative path with query params and hash', async () => {
    expect(
      relative('./subdir/index.tsx?foo=bar#foobar')
    ).toEqual(`${URL_PREFIX}/files/subdir/index.tsx?foo=bar#foobar`);
  });

  it('absolute path with query params', async () => {
    expect(
      relative('/subdir/index.tsx?foo=bar')
    ).toEqual(`${URL_PREFIX}/files/subdir/index.tsx?foo=bar`);
  });

  it('absolute path with hash', async () => {
    expect(
      relative('/subdir/index.tsx#foobar')
    ).toEqual(`${URL_PREFIX}/files/subdir/index.tsx#foobar`);
  });
});

