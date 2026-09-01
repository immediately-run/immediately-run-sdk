// G-GA-7 (the SDK half): a scan's headings carry ids from the mdx-plugins canon —
// the SAME `headingId` the rendered anchors use — with the remark pass's duplicate
// counter, code fences skipped, and inline markup flattened.
import { collectHeadings } from './collectHeadings';
import { headingId, SLUG_PARITY_FIXTURE } from '@immediately-run/mdx-plugins';

const BODY = `# Intro

Prose under the intro.

## The **bold** heading

## Getting started

## Getting started

### A \`code\` heading

## 8. Capability model

~~~
## not a heading (tilde fence)
~~~

\`\`\`js
// ## not a heading either (backtick fence)
\`\`\`
`;

describe('G-GA-7 — ids match the rendered anchors (the mdx-plugins canon)', () => {
  it('every fixture text the canon defines produces the canon id', () => {
    for (const c of SLUG_PARITY_FIXTURE) {
      const heads = collectHeadings(`## ${c.text}\n`);
      expect(heads[0].id).toBe(c.id);
      expect(heads[0].text).toBe(c.text.trim());
    }
  });

  it('depths, duplicates, fences, and inline flattening', () => {
    const heads = collectHeadings(BODY);
    expect(heads).toEqual([
      { id: 'intro', text: 'Intro', depth: 1 },
      { id: 'the-bold-heading', text: 'The bold heading', depth: 2 },
      { id: 'getting-started', text: 'Getting started', depth: 2 },
      { id: 'getting-started-1', text: 'Getting started', depth: 2 }, // the remark pass's duplicate counter (first duplicate gets -1)
      { id: 'a-code-heading', text: 'A code heading', depth: 3 },
      { id: 'sec-8', text: '8. Capability model', depth: 2 },
    ]);
  });

  it('is directly consistent with headingId for each extracted text', () => {
    for (const h of collectHeadings(BODY)) {
      expect(h.id.startsWith(headingId(h.text))).toBe(true);
    }
  });

  it('an empty or heading-free body yields []', () => {
    expect(collectHeadings('')).toEqual([]);
    expect(collectHeadings('Just prose.\n\nMore prose.')).toEqual([]);
  });
});
