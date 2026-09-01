// GROVE_AGENT_SPEC gates exercised here (SDK side):
//   G-GA-3 — the metadata tool rejects non-declarative arguments and
//            proto-polluting keys at the boundary.
//   G-GA-4 — it answers from the index without opening file bodies (purity is the
//            whole design: there is no fs in scope to spy on — asserted by shape).
//   G-GA-11 — results are filtered to the read chroot; out-of-chroot rows
//            (app-source MDX) and app-excluded rows (`_layout.mdx`) never return.
import {
  runMetadataQuery,
  executeMetadataQuery,
  createMetadataQueryTool,
  globToRegExp,
  MetadataQueryError,
} from './metadataQueryTool';

const CHROOT = '/app/content/';

function seedIndex() {
  return {
    '/app/content/index.mdx': { title: 'Home', tags: ['intro', 'meta'], order: 1 },
    '/app/content/wiki/security.mdx': { title: 'Security', tags: ['security'], updated: '2026-06-01' },
    '/app/content/wiki/tools.mdx': { title: 'Tools', tags: ['security', 'tooling'], updated: '2026-08-01' },
    '/app/content/_layout.mdx': { title: 'Layout' },
    '/app/src/App.mdx': { title: 'App source MDX (out of chroot)' },
  };
}

const noUnderscoreFiles = (p: string) => !p.split('/').some((seg) => seg.startsWith('_'));

describe('G-GA-3 — declarative boundary hygiene', () => {
  it('rejects proto-polluting key segments (BUNDLE_EMBEDDING §4.1)', () => {
    for (const key of ['__proto__.x', 'constructor', 'a.prototype.b', '__proto__']) {
      expect(() => runMetadataQuery(seedIndex(), CHROOT, { where: [{ key, op: 'exists' }] })).toThrow(
        MetadataQueryError,
      );
    }
  });

  it('rejects path separators in keys (dotted paths only, never expressions)', () => {
    expect(() => runMetadataQuery(seedIndex(), CHROOT, { where: [{ key: 'a/b', op: 'exists' }] })).toThrow(
      MetadataQueryError,
    );
    // Expression-shaped keys are not interpreted at all — they simply never match
    // (there is no evaluator to inject). An expression stays data, and data that
    // names no field selects nothing.
    expect(
      runMetadataQuery(
        seedIndex(),
        CHROOT,
        { where: [{ key: 'tags; process.exit(1)', op: 'exists' }] },
        noUnderscoreFiles,
      ),
    ).toEqual([]);
  });

  it('rejects function-shaped and non-scalar eq values', () => {
    expect(() =>
      runMetadataQuery(seedIndex(), CHROOT, { where: [{ key: 'title', op: 'eq', value: () => 1 }] }),
    ).toThrow(MetadataQueryError);
    expect(() =>
      runMetadataQuery(seedIndex(), CHROOT, { where: [{ key: 'title', op: 'eq', value: { a: 1 } }] }),
    ).toThrow(MetadataQueryError);
  });

  it('rejects unknown top-level arguments and unknown ops', () => {
    expect(() => runMetadataQuery(seedIndex(), CHROOT, { filter: 'x' })).toThrow(MetadataQueryError);
    expect(() => runMetadataQuery(seedIndex(), CHROOT, { where: [{ key: 'a', op: 'eval', value: '1' }] })).toThrow(
      MetadataQueryError,
    );
    expect(() => runMetadataQuery(seedIndex(), CHROOT, 'not an object')).toThrow(MetadataQueryError);
    expect(() => runMetadataQuery(seedIndex(), CHROOT, null)).toThrow(MetadataQueryError);
  });

  it('does not pollute Object.prototype through dotted keys (the attack lands nowhere)', () => {
    expect(() =>
      runMetadataQuery(seedIndex(), CHROOT, { where: [{ key: '__proto__.polluted', op: 'eq', value: 'yes' }] }),
    ).toThrow(MetadataQueryError);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('query semantics', () => {
  it('eq / contains / in / exists over frontmatter, ANDed', () => {
    const idx = seedIndex();
    const tagSec = runMetadataQuery(
      idx,
      CHROOT,
      { where: [{ key: 'tags', op: 'contains', value: 'security' }] },
      noUnderscoreFiles,
    );
    expect(tagSec.map((r) => r.path).sort()).toEqual(['wiki/security.mdx', 'wiki/tools.mdx']);

    const both = runMetadataQuery(
      idx,
      CHROOT,
      {
        where: [
          { key: 'tags', op: 'contains', value: 'security' },
          { key: 'title', op: 'eq', value: 'Tools' },
        ],
      },
      noUnderscoreFiles,
    );
    expect(both.map((r) => r.path)).toEqual(['wiki/tools.mdx']);

    const inOp = runMetadataQuery(
      idx,
      CHROOT,
      { where: [{ key: 'title', op: 'in', value: ['Home', 'Security'] }] },
      noUnderscoreFiles,
    );
    expect(inOp.map((r) => r.path).sort()).toEqual(['index.mdx', 'wiki/security.mdx']);

    const exists = runMetadataQuery(idx, CHROOT, { where: [{ key: 'updated', op: 'exists' }] }, noUnderscoreFiles);
    expect(exists.map((r) => r.path).sort()).toEqual(['wiki/security.mdx', 'wiki/tools.mdx']);
  });

  it('sortBy + order + limit, rows lacking the sort key last', () => {
    const idx = seedIndex();
    const rows = runMetadataQuery(idx, CHROOT, { sortBy: 'order', order: 'desc', limit: 1 }, noUnderscoreFiles);
    expect(rows).toHaveLength(1); // only index.mdx HAS order
    expect(rows[0].path).toBe('index.mdx');
  });

  it('select narrows the returned frontmatter', () => {
    const rows = runMetadataQuery(
      seedIndex(),
      CHROOT,
      { select: ['title'], where: [{ key: 'title', op: 'eq', value: 'Security' }] },
      noUnderscoreFiles,
    );
    expect(rows[0].meta).toEqual({ title: 'Security' });
  });

  it('pathGlob scopes by path (* one segment, ** any)', () => {
    const idx = seedIndex();
    expect(runMetadataQuery(idx, CHROOT, { pathGlob: '*.mdx' }, noUnderscoreFiles).map((r) => r.path)).toEqual([
      'index.mdx',
    ]);
    expect(runMetadataQuery(idx, CHROOT, { pathGlob: 'wiki/*.mdx' }, noUnderscoreFiles)).toHaveLength(2);
    expect(globToRegExp('a/**').test('a/b/c.mdx')).toBe(true);
    expect(globToRegExp('a/*').test('a/b/c.mdx')).toBe(false);
  });

  it('hoists the additive headings field out of meta and returns it on the row', () => {
    const idx = { '/app/content/a.mdx': { title: 'A', headings: [{ id: 'sec-1', text: '1.', depth: 2 }] } };
    const rows = runMetadataQuery(idx, CHROOT, {});
    expect(rows[0].meta).toEqual({ title: 'A' });
    expect(rows[0].headings).toEqual([{ id: 'sec-1', text: '1.', depth: 2 }]);
  });
});

describe('G-GA-11 — rows confined to the read chroot', () => {
  it('an index seeded with out-of-chroot rows (app-source MDX, `_layout.mdx`) returns none of them', () => {
    const rows = runMetadataQuery(seedIndex(), CHROOT, {}, noUnderscoreFiles);
    const paths = rows.map((r) => r.path);
    expect(paths).not.toContain('..');
    expect(paths.every((p) => !p.startsWith('/'))).toBe(true); // chroot-RELATIVE
    expect(paths).toEqual(['index.mdx', 'wiki/security.mdx', 'wiki/tools.mdx']);
    // `/app/src/App.mdx` — outside the chroot; `_layout.mdx` — app row-policy.
  });

  it('the chroot filter alone (no app policy) still drops out-of-chroot rows only', () => {
    const rows = runMetadataQuery(seedIndex(), CHROOT, {});
    expect(rows.map((r) => r.path)).toContain('_layout.mdx'); // in-chroot, policy is the app's call
  });
});

describe('G-GA-4 — answers come from the index, never file bodies', () => {
  it('executeMetadataQuery returns fenced rows; a structure query performs no file reads (the module has no fs access at all)', async () => {
    const idx = seedIndex();
    const tool = createMetadataQueryTool({ chroot: CHROOT, getIndex: () => idx, filter: noUnderscoreFiles });
    const out = tool.execute({ where: [{ key: 'tags', op: 'contains', value: 'security' }] });
    expect(out.isError).toBeUndefined();
    expect(out.content).toContain('[untrusted:');
    expect(out.content).toContain('wiki/security.mdx');

    const bad = tool.execute({ where: [{ key: '__proto__.x', op: 'exists' }] });
    expect(bad.isError).toBe(true);
    expect(bad.content).toContain('invalid-params');
  });
});
