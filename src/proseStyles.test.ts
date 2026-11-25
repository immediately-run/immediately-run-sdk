/**
 * @jest-environment jsdom
 */
import { ensureProseStyles, isProseFile, PROSE_STYLE_ID, PROSE_STYLE_TEXT, PROSE_TOKENS } from './proseStyles';

describe('isProseFile', () => {
  it.each(['README.md', 'docs/guide.mdx', 'UPPER.MD', 'Mixed.Mdx'])('wraps %s', (path) => {
    expect(isProseFile(path)).toBe(true);
  });
  it.each(['src/App.tsx', 'index.html', 'README', 'notes.md.tsx', 'markdown', 'notes/a.markdown'])(
    'leaves %s alone',
    (path) => {
      expect(isProseFile(path)).toBe(false);
    },
  );
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
    expect(PROSE_STYLE_TEXT).toMatch(/@media \(hover: hover\) and \(width >= 48rem\)[\s\S]*inset-inline-end: 100%/);
    expect(PROSE_STYLE_TEXT).toMatch(/@media \(hover: none\), \(width < 48rem\)[\s\S]*float: inline-end/);
    expect(PROSE_STYLE_TEXT).not.toContain('flex-direction');
  });

  it('centres the column with a grid on the article itself, not with percentage padding', () => {
    // Percentage padding resolves against the PARENT's width, which squeezed a <Prose>
    // placed as a flex item beside a sidebar.
    expect(PROSE_STYLE_TEXT).toContain('display: grid;');
    expect(PROSE_STYLE_TEXT).not.toMatch(/padding-inline:[^;]*100%/);
    expect(PROSE_STYLE_TEXT).toMatch(/> \* \{ grid-column: 2;/);
    // With min-height: 100dvh, auto rows would otherwise stretch to fill a short file.
    expect(PROSE_STYLE_TEXT).toContain('align-content: start;');
  });

  it('spaces an hr with start margins only (grid items do not collapse margins)', () => {
    // In the BODY font (not em), so a smaller-font pre/table/h4 after a rule gets the same gap.
    expect(PROSE_STYLE_TEXT).toContain(
      '> hr + * { margin-block-start: calc(2.5 * var(--prose-size, var(--_ir-prose-size))); }',
    );
    expect(PROSE_STYLE_TEXT).toMatch(
      /> hr \+ :is\(h1, h2, h3, h4, h5, h6\):not\(:first-child\) \{ margin-block-start: max\(2\.2em,/,
    );
    expect(PROSE_STYLE_TEXT).not.toMatch(/hr \{[^}]*margin-block:/);
  });

  it('drops the bullet of every task item, tight or loose (the checkbox is not a direct child in a loose list)', () => {
    expect(PROSE_STYLE_TEXT).toContain('li.task-list-item { list-style: none;');
    expect(PROSE_STYLE_TEXT).not.toContain(':has(> input');
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

  it('goes before every stylesheet already in head, so ir.defaults is the lowest layer', () => {
    const app = document.createElement('style');
    app.textContent = '@layer base { h2 { color: red } }';
    document.head.appendChild(app);
    ensureProseStyles();
    expect(document.head.firstElementChild?.id).toBe(PROSE_STYLE_ID);
    app.remove();
  });
});
