/**
 * @jest-environment jsdom
 */
import { ensureProseStyles, isProseFile, PROSE_STYLE_ID, PROSE_STYLE_TEXT, PROSE_TOKENS } from './proseStyles';

describe('isProseFile', () => {
  it.each(['README.md', 'docs/guide.mdx', 'notes/a.markdown', 'UPPER.MD', 'Mixed.Mdx'])('wraps %s', (path) => {
    expect(isProseFile(path)).toBe(true);
  });
  it.each(['src/App.tsx', 'index.html', 'README', 'notes.md.tsx', 'markdown'])('leaves %s alone', (path) => {
    expect(isProseFile(path)).toBe(false);
  });
});

describe('PROSE_STYLE_TEXT', () => {
  it('declares every token default and reads every public name with that default behind it', () => {
    for (const token of PROSE_TOKENS) {
      expect(PROSE_STYLE_TEXT).toContain(`--_ir-${token.name}: ${token.light};`);
      if (token.dark !== token.light) expect(PROSE_STYLE_TEXT).toContain(`--_ir-${token.name}: ${token.dark};`);
      expect(PROSE_STYLE_TEXT).toContain(`var(--${token.name}, var(--_ir-${token.name}))`);
    }
  });

  it('never declares a public token itself, so an inherited or author value is not shadowed', () => {
    for (const token of PROSE_TOKENS) {
      expect(PROSE_STYLE_TEXT).not.toMatch(new RegExp(`(^|[\\s;{])--${token.name}\\s*:`));
    }
  });

  it('sits entirely inside the ir.defaults layer', () => {
    expect(PROSE_STYLE_TEXT.trimStart().startsWith('@layer ir.defaults {')).toBe(true);
    expect(PROSE_STYLE_TEXT.trimEnd().endsWith('}')).toBe(true);
    expect(PROSE_STYLE_TEXT.match(/@layer/g)).toHaveLength(1);
  });

  it('names no location and forces nothing', () => {
    for (const banned of ['url(', '@import', '@font-face', '!important']) {
      expect(PROSE_STYLE_TEXT).not.toContain(banned);
    }
  });

  it('has balanced braces (a stray brace would silently drop every later rule)', () => {
    const open = PROSE_STYLE_TEXT.split('{').length;
    const close = PROSE_STYLE_TEXT.split('}').length;
    expect(open).toBe(close);
  });

  it('places the heading anchor in the gutter for hover devices and floats it for touch', () => {
    expect(PROSE_STYLE_TEXT).toMatch(/@media \(hover: hover\)[\s\S]*inset-inline-end: 100%/);
    expect(PROSE_STYLE_TEXT).toMatch(/@media \(hover: none\)[\s\S]*float: inline-end/);
    expect(PROSE_STYLE_TEXT).not.toContain('flex-direction');
  });
});

describe('ensureProseStyles', () => {
  afterEach(() => document.getElementById(PROSE_STYLE_ID)?.remove());

  it('injects one style element however often it is called', () => {
    ensureProseStyles();
    ensureProseStyles();
    const styles = document.querySelectorAll(`#${PROSE_STYLE_ID}`);
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toBe(PROSE_STYLE_TEXT);
  });
});
