// Safe content renderer — the END-TO-END fail-safe proof (TRUST_MODES_SPEC §5.1).
//
// The pure-logic security cases live in `src/safeContent/safeContent.test.tsx` (jest,
// CJS). This file proves the HEADLINE guarantee that needs the REAL no-acorn parse:
// running untrusted MDX-syntax source through `parseSafeMdast` + `renderMdast` calls
// **no evaluator anywhere in the pipeline** — a spy on `fetch`/`Function`/`eval`/
// `setTimeout`(string) records ZERO calls, and the expression `fetch("/x")` is present
// only as an inert string in the parsed tree, never invoked. Run under native Node ESM
// (`node --test`) because the parser deps are ESM-only (the repo's ts-jest is CJS) —
// the same split the transpiler uses for its `@mdx-js/mdx` compile tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

// The safe renderer, bundled into one self-contained ESM file by
// `scripts/build-safecontent-e2e.mjs` (the `test:safe-content` script runs it first).
// The shipped `bundle:false` dist has extensionless internal imports Node's native ESM
// rejects, so we bundle for the e2e; react + the ESM parser deps stay external, and the
// parser's dynamic `import()` runs the REAL no-acorn pipeline.
import { parseSafeMdast, renderMdast } from './.artifacts/safeContent.bundle.mjs';

// Install eval-detecting spies. If ANY of these fire, the pipeline evaluated author
// input — a fail. `Function`/`eval` are the estree-execution paths acorn would enable;
// `fetch` is the payload in the source; string `setTimeout` is a classic eval sink.
function withEvalSpies(fn) {
  const calls = [];
  const g = globalThis;
  const orig = {
    fetch: g.fetch,
    eval: g.eval,
    Function: g.Function,
    setTimeout: g.setTimeout,
  };
  g.fetch = (...a) => {
    calls.push(['fetch', a[0]]);
    throw new Error('fetch must not be called');
  };
  // eslint-disable-next-line no-global-assign
  g.setTimeout = (h, ...rest) => {
    if (typeof h === 'string') calls.push(['setTimeout(string)', h]);
    return orig.setTimeout(typeof h === 'function' ? h : () => {}, ...rest);
  };
  const FakeFunction = function (...a) {
    calls.push(['Function', a]);
    throw new Error('Function must not be constructed');
  };
  FakeFunction.prototype = Function.prototype;
  g.Function = FakeFunction;
  g.eval = (s) => {
    calls.push(['eval', s]);
    throw new Error('eval must not be called');
  };
  try {
    return fn(calls);
  } finally {
    Object.assign(g, orig);
  }
}

const MALICIOUS = [
  '# Board title',
  '',
  '<WikiEmbed src="ok.png" f={fetch("/steal")} n={1+1} {...props}/>',
  '',
  'Body text with a literal {expression} and an inline <b>{x}</b> tag.',
  '',
  '<script>fetch("/steal2")</script>',
  '',
  '<div onclick="fetch(\'/steal3\')">click</div>',
  '',
  '[bad](javascript:fetch("/steal4"))',
  '',
  '![evil](data:text/html,<script>fetch("/steal5")</script>)',
].join('\n');

test('§5.1 fail-safe: parse+render of hostile MDX calls NO evaluator (fetch/Function/eval spy = 0)', async () => {
  const tree = await parseSafeMdast(MALICIOUS);
  // The expression is present ONLY as an inert string in the tree — never executed.
  // (Walk for an attribute-value-expression node whose raw value is the fetch call —
  // no estree/data on it, proving no acorn parsed it.)
  let inertExpr = null;
  const walk = (n) => {
    for (const a of n.attributes ?? []) {
      const v = a.value;
      if (v && typeof v === 'object' && typeof v.value === 'string' && v.value.includes('fetch(')) {
        inertExpr = v;
      }
    }
    for (const c of n.children ?? []) walk(c);
  };
  walk(tree);
  assert.ok(inertExpr, 'the expression should be captured as an inert node');
  assert.equal(inertExpr.value, 'fetch("/steal")'); // verbatim raw string
  assert.ok(!('data' in inertExpr) && !('estree' in inertExpr), 'no estree/data — no acorn parsed it');

  const html = withEvalSpies((calls) => {
    const el = createElement(
      'div',
      null,
      renderMdast(tree, {
        // Even a REGISTERED component only receives literal props — never the expressions.
        components: { WikiEmbed: (props) => createElement('span', { 'data-src': props.src ?? '' }) },
        resolveWikiLink: () => undefined,
      }),
    );
    const out = renderToStaticMarkup(el);
    assert.deepEqual(calls, [], `no evaluator may fire — got ${JSON.stringify(calls)}`);
    return out;
  });

  // Positive: the literal prop reached the component; the expression did not.
  assert.match(html, /data-src="ok.png"/);
  // The zero-eval assertion above (calls === []) is the headline proof. The remaining
  // checks confirm nothing landed in an EXECUTABLE position — raw HTML is rendered as
  // inert TEXT (so "steal" may appear as escaped visible text, which is SAFE and
  // expected; "render as data" shows the literal markup). What must NOT appear:
  //   - a real <script> element or event-handler attribute (raw HTML injected)
  //   - a live javascript:/data: URL in an href/src
  //   - an escaped-but-injected tag would show as `&lt;script&gt;` text — allowed.
  // Match only REAL opening tags (`<tag …`); escaped inert text starts with `&lt;`
  // so it can never match these — the payload is present only as escaped text.
  assert.doesNotMatch(html, /<script[\s>]/i, 'no real <script> element');
  assert.doesNotMatch(html, /<[a-z][a-z0-9]*\b[^>]*\son[a-z]+=/i, 'no real element with an on* handler attribute');
  assert.doesNotMatch(html, /href="javascript:/i, 'no javascript: href');
  assert.doesNotMatch(html, /(href|src)="data:/i, 'no data: URL in an attribute');
  // The raw-HTML payloads survive only as ESCAPED inert text (proof they were NOT
  // parsed into live DOM): `<script>` shows up escaped as `&lt;script&gt;`.
  assert.match(html, /&lt;script&gt;/, 'raw <script> is shown escaped as inert text');
  // §5.1 test 5 — expression children are inert: the mdx *expression* extension is
  // off, so `{x}` inside a tag and `{expression}` in body text stay LITERAL text.
  assert.match(html, /\{x\}/, 'inline `<b>{x}</b>` keeps {x} as literal text');
  assert.match(html, /\{expression\}/, 'body `{expression}` stays literal');
});

test('R3-213: the real parse runs the SHARED kernel remark plugins (heading ids, admonitions, wiki-links)', async () => {
  // The safe subset the compiled path also renders — proving `parseSafeMdast` runs the
  // SAME @immediately-run/mdx-plugins the transpiler runs, so the two paths can't drift.
  const src = [
    '## 8.9 Powerbox',
    '',
    '> [!NOTE]',
    '> heads up',
    '',
    'See [[Guide|specs/x.mdx#sec-3-2]] and [[plain.mdx]].',
  ].join('\n');
  const tree = await parseSafeMdast(src);

  const find = (pred) => {
    let hit = null;
    const walk = (n) => {
      if (hit) return;
      if (pred(n)) {
        hit = n;
        return;
      }
      for (const c of n.children ?? []) walk(c);
    };
    walk(tree);
    return hit;
  };
  const attrVal = (n, name) => n.attributes?.find((a) => a.name === name)?.value;

  // (a) heading anchors (R3-186/R3-211): section id via data.hProperties + prepended anchor.
  const heading = find((n) => n.type === 'heading');
  assert.equal(heading?.data?.hProperties?.id, 'sec-8-9', 'section-id set on the heading (hProperties)');
  assert.equal(heading.children[0].type, 'mdxJsxTextElement');
  assert.equal(heading.children[0].name, 'HeadingAnchor');

  // (b) admonitions (§12): `> [!NOTE]` → <Admonition type="note">.
  const adm = find((n) => n.name === 'Admonition');
  assert.ok(adm, 'admonition element produced');
  assert.equal(adm.type, 'mdxJsxFlowElement');
  assert.equal(attrVal(adm, 'type'), 'note');

  // (c) wiki-links (§13): `[[label|target]]` → <WikiLink> carrying the RAW target incl.
  // the `#sec-3-2` deep-link fragment (verbatim — resolution is a render concern).
  const wl = find((n) => n.name === 'WikiLink');
  assert.ok(wl, 'wiki-link element produced');
  assert.equal(wl.type, 'mdxJsxTextElement');
  assert.equal(attrVal(wl, 'target'), 'specs/x.mdx#sec-3-2');
  assert.equal(attrVal(wl, 'label'), 'Guide');
});

test('§5.1: the safe pipeline never imports @mdx-js/mdx compile() or acorn (compiled path unreachable)', async () => {
  // Gate wiring (test 7): the safe terminal must not route through the executable
  // (compiled MDX) path. Assert the built safe module graph never IMPORTS `@mdx-js/mdx`
  // or `acorn` — the evaluator edges that would make it executable.
  //
  // We match import/require EDGES, not any substring "acorn". Since R3-213's packaging
  // fix, `dist/safeContent/mdastDeps.js` is a self-contained esbuild bundle that inlines
  // the micromark-mdx-jsx parser tree; that tree carries one INERT `ruleId: 'acorn'`
  // string (a vfile-message label in `micromark-factory-mdx-expression`, never an
  // evaluator) and no acorn code — acorn is not a runtime edge of the tree (only passing
  // an acorn option would wire it, which `parseSafeMdast` never does). A substring check
  // would false-positive on that label; the import-edge check catches the real regression
  // (someone actually wiring acorn/mdx compile into the pipeline). The behavioral proof —
  // the eval spies above recording ZERO calls — remains the primary fail-safe.
  const { readFileSync, readdirSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const dir = fileURLToPath(new URL('../dist/safeContent/', import.meta.url));
  const files = readdirSync(dir).filter((f) => f.endsWith('.js') || f.endsWith('.cjs'));
  const importsModule = (src, mod) => {
    const m = mod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return (
      new RegExp(`from\\s*["']${m}["']`).test(src) ||
      new RegExp(`(?:import|require)\\(\\s*["']${m}["']\\s*\\)`).test(src)
    );
  };
  for (const f of files) {
    const src = readFileSync(dir + f, 'utf8');
    assert.ok(!/@mdx-js\/mdx/.test(src), `${f} must not reference @mdx-js/mdx`);
    assert.ok(!importsModule(src, 'acorn'), `${f} must not import acorn`);
  }
});
