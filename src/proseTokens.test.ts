import { PROSE_TOKENS } from './proseStyles';
import {
  affectsTokenLookup,
  parseProseTokenFile,
  PROSE_MARKER_FILE,
  PROSE_TOKEN_FILE,
  PROSE_TOKEN_FILE_MAX_BYTES,
  PROSE_TOKEN_VALUE_MAX_LENGTH,
  resolveTokenFile,
  tokensFor,
  type ParsedProseTokenFile,
  type ProseTokenProbe,
} from './proseTokens';

const names = PROSE_TOKENS.map((token) => `--${token.name}`);

const ok = (parsed: ParsedProseTokenFile) => {
  if (!parsed.ok) throw new Error(`refused: ${parsed.reason}`);
  return parsed;
};

describe('parseProseTokenFile', () => {
  it('accepts the three blocks, and the polarity block wins over :root', () => {
    const parsed = ok(
      parseProseTokenFile(`
        /* brand */
        :root { --accent: #b5482a; --prose-measure: 72ch; }
        :root[data-theme="light"] { --ink: #222; }
        :root[data-theme='dark'] { --accent: #f08a5d; --ink: #eee }
      `),
    );
    expect(parsed.warnings).toEqual([]);
    expect(Object.fromEntries(tokensFor(parsed.blocks, 'light'))).toEqual({
      '--accent': '#b5482a',
      '--prose-measure': '72ch',
      '--ink': '#222',
    });
    expect(Object.fromEntries(tokensFor(parsed.blocks, 'dark'))).toEqual({
      '--accent': '#f08a5d',
      '--prose-measure': '72ch',
      '--ink': '#eee',
    });
  });

  it('accepts every public token by its real name', () => {
    const body = names.map((name) => `${name}: x;`).join(' ');
    const parsed = ok(parseProseTokenFile(`:root { ${body} }`));
    expect(Object.keys(parsed.blocks.root).sort()).toEqual([...names].sort());
    expect(parsed.warnings).toEqual([]);
  });

  it.each([
    ['@import', '@import "x.css";\n:root { --ink: red; }'],
    ['@font-face', '@font-face { font-family: X; src: local(X); }'],
    ['@media', '@media (min-width: 1px) { :root { --ink: red; } }'],
    ['an element selector', 'h2 { --ink: red; }'],
    ['an attribute selector', 'a[href^=x] { --ink: red; }'],
    ['a second selector in the list', ':root, h2 { --ink: red; }'],
    ['a non-custom property', ':root { color: red; }'],
    ['a mixed block', ':root { --ink: red; color: red; }'],
    ['an unclosed block', ':root { --ink: red;'],
    ['an unterminated comment', ':root { --ink: red; } /* x'],
  ])('refuses the whole file for %s', (_label, text) => {
    expect(parseProseTokenFile(text).ok).toBe(false);
  });

  it.each([
    ['url(', 'url(https://x/y.png)'],
    ['url( in another case', 'URL(x)'],
    ['image(', 'image(red)'],
    ['image-set(', 'image-set("a.png" 1x)'],
    ['cross-fade(', 'cross-fade(red, blue)'],
    ['element(', 'element(#x)'],
    ['src(', 'src("x")'],
    ['@', 'a@b'],
    ['\\ (an escape spelling url without its letters)', 'u\\72l(x)'],
    [';', '"a;b"'],
    ['{', '"a{b"'],
    ['}', '"a}b"'],
    ['<', '"a<b"'],
    ['>', '"a>b"'],
  ])('drops a value containing %s and keeps the rest of the file', (_label, value) => {
    const parsed = ok(parseProseTokenFile(`:root { --accent: ${value}; --ink: #111; }`));
    expect(parsed.blocks.root).toEqual({ '--ink': '#111' });
    expect(parsed.warnings).toEqual([expect.stringContaining('--accent')]);
  });

  it('drops a value longer than the cap and keeps one at the cap', () => {
    const atCap = 'a'.repeat(PROSE_TOKEN_VALUE_MAX_LENGTH);
    const over = 'a'.repeat(PROSE_TOKEN_VALUE_MAX_LENGTH + 1);
    expect(over).toHaveLength(257);
    const parsed = ok(parseProseTokenFile(`:root { --sans: ${atCap}; --mono: ${over}; }`));
    expect(parsed.blocks.root).toEqual({ '--sans': atCap });
    expect(parsed.warnings).toEqual([expect.stringContaining('--mono')]);
  });

  it('drops an unknown token name with a warning naming it', () => {
    const parsed = ok(parseProseTokenFile(':root { --brand-hue: 12; --ink: #111; }'));
    expect(parsed.blocks.root).toEqual({ '--ink': '#111' });
    expect(parsed.warnings).toEqual([expect.stringContaining('--brand-hue')]);
  });

  it('refuses a file one byte over the cap and accepts a realistic file', () => {
    const head = ':root { --ink: #111; }\n';
    const pad = (n: number) => `${head}/*${'x'.repeat(n - head.length - 4)}*/`;
    expect(new TextEncoder().encode(pad(PROSE_TOKEN_FILE_MAX_BYTES)).length).toBe(PROSE_TOKEN_FILE_MAX_BYTES);
    expect(parseProseTokenFile(pad(PROSE_TOKEN_FILE_MAX_BYTES)).ok).toBe(true);
    expect(parseProseTokenFile(pad(PROSE_TOKEN_FILE_MAX_BYTES + 1)).ok).toBe(false);

    const realistic = `/* A serif reading theme. */
:root {
  --sans: "Iowan Old Style", "Palatino Linotype", Georgia, serif;
  --disp: var(--sans);
  --prose-size: 1.125rem;
  --prose-measure: 64ch;
  --radius-shape: 4px;
}
:root[data-theme="light"] { --bg: #fbf8f1; --ink: #2b2620; --accent: #9c3d1b; }
:root[data-theme="dark"] { --bg: #1c1a17; --ink: #e8e1d4; --accent: #f0a07a; }
`;
    const parsed = ok(parseProseTokenFile(realistic));
    expect(parsed.warnings).toEqual([]);
    expect(Object.keys(parsed.blocks.root)).toHaveLength(5);
  });
});

/** An in-memory repo: path → file text. */
const probeOver = (files: Record<string, string>): ProseTokenProbe & { reads: string[] } => {
  const reads: string[] = [];
  return {
    reads,
    async size(path) {
      reads.push(path);
      return path in files ? new TextEncoder().encode(files[path]).length : null;
    },
    async read(path) {
      reads.push(path);
      return path in files ? files[path] : null;
    },
  };
};

describe('resolveTokenFile', () => {
  it('takes the nearest directory holding the token file', async () => {
    const probe = probeOver({ [PROSE_TOKEN_FILE]: ':root{}', [`guide/${PROSE_TOKEN_FILE}`]: ':root{}' });
    expect((await resolveTokenFile('guide/deep', probe)).path).toBe(`guide/${PROSE_TOKEN_FILE}`);
    expect((await resolveTokenFile('other', probe)).path).toBe(PROSE_TOKEN_FILE);
  });

  it('stops at a marker without a token file, so a bundle does not inherit the repo root', async () => {
    const probe = probeOver({ [PROSE_TOKEN_FILE]: ':root{}', [`bundle/${PROSE_MARKER_FILE}`]: '{}' });
    const resolved = await resolveTokenFile('bundle/docs', probe);
    expect(resolved).toMatchObject({ path: null, dir: 'bundle', warnings: [] });
  });

  it('follows a styles string, relative to the marker', async () => {
    const probe = probeOver({
      [`b/${PROSE_MARKER_FILE}`]: JSON.stringify({ styles: 'theme/reading.css' }),
      'b/theme/reading.css': ':root{}',
      [`b/${PROSE_TOKEN_FILE}`]: ':root{}',
    });
    expect((await resolveTokenFile('b', probe)).path).toBe('b/theme/reading.css');
  });

  it('turns author tokens off for styles: false, even with a token file beside it', async () => {
    const probe = probeOver({
      [PROSE_MARKER_FILE]: JSON.stringify({ styles: false }),
      [PROSE_TOKEN_FILE]: ':root{}',
    });
    expect(await resolveTokenFile('', probe)).toMatchObject({ path: null, warnings: [] });
  });

  it('warns on a styles field of the wrong type and falls back to the default file', async () => {
    const probe = probeOver({ [PROSE_MARKER_FILE]: JSON.stringify({ styles: 3 }), [PROSE_TOKEN_FILE]: ':root{}' });
    const resolved = await resolveTokenFile('', probe);
    expect(resolved.path).toBe(PROSE_TOKEN_FILE);
    expect(resolved.warnings).toEqual([expect.stringContaining('"styles" must be')]);
  });

  it.each(['../x.css', 'a/../../x.css', '/x.css', 'https://x', 'data:text/css,x'])(
    'refuses styles: %s',
    async (styles) => {
      const probe = probeOver({
        [`b/${PROSE_MARKER_FILE}`]: JSON.stringify({ styles }),
        'x.css': ':root{}',
        [`b/${PROSE_TOKEN_FILE}`]: ':root{}',
      });
      const resolved = await resolveTokenFile('b', probe);
      expect(resolved.path).toBeNull();
      expect(resolved.warnings).toHaveLength(1);
      expect(probe.reads).not.toContain('x.css');
    },
  );

  it('warns on an unparseable marker and treats styles as absent', async () => {
    const probe = probeOver({ [PROSE_MARKER_FILE]: '{ nope', [PROSE_TOKEN_FILE]: ':root{}' });
    const resolved = await resolveTokenFile('', probe);
    expect(resolved.path).toBe(PROSE_TOKEN_FILE);
    expect(resolved.warnings).toEqual([expect.stringContaining('not valid JSON')]);
  });

  it('warns when a named file is missing, and is silent when the default is', async () => {
    const named = await resolveTokenFile(
      '',
      probeOver({ [PROSE_MARKER_FILE]: JSON.stringify({ styles: 'gone.css' }) }),
    );
    expect(named.path).toBeNull();
    expect(named.warnings).toEqual([expect.stringContaining('gone.css')]);

    const quiet = await resolveTokenFile('', probeOver({ [PROSE_MARKER_FILE]: '{"name":"x"}' }));
    expect(quiet).toMatchObject({ path: null, warnings: [] });
  });

  it('stops at the repo root and never probes above it', async () => {
    const probe = probeOver({});
    expect(await resolveTokenFile('a/b', probe)).toMatchObject({ path: null, warnings: [] });
    expect(probe.reads.every((p) => !p.startsWith('..') && !p.startsWith('/'))).toBe(true);
    expect(probe.reads).toContain(PROSE_MARKER_FILE);
    expect(probe.reads).toContain(PROSE_TOKEN_FILE);
  });
});

describe('affectsTokenLookup', () => {
  it('is true for the resolved file and for markers or token files on the walked path', () => {
    expect(affectsTokenLookup('b/theme/reading.css', 'b/docs', 'b/theme/reading.css')).toBe(true);
    expect(affectsTokenLookup(`/${PROSE_MARKER_FILE}`, 'b/docs', null)).toBe(true);
    expect(affectsTokenLookup(`b/docs/${PROSE_TOKEN_FILE}`, 'b/docs', null)).toBe(true);
  });

  it('is true for a styles-named file that is watched before it exists', () => {
    expect(affectsTokenLookup('theme/alt.css', '', 'theme/alt.css')).toBe(true);
    expect(affectsTokenLookup('theme/alt.css', '', null)).toBe(false);
  });

  it('is false for other files and for a sibling directory', () => {
    expect(affectsTokenLookup('b/docs/README.md', 'b/docs', null)).toBe(false);
    expect(affectsTokenLookup(`c/${PROSE_TOKEN_FILE}`, 'b/docs', null)).toBe(false);
    expect(affectsTokenLookup(`b/docs2/${PROSE_TOKEN_FILE}`, 'b/docs', null)).toBe(false);
  });
});
