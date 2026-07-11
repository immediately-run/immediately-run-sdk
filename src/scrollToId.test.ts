/**
 * @jest-environment jsdom
 */
import { scrollToId } from './scrollToId';

describe('scrollToId (§13.5)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('scrolls to an element by its own id and reports success', () => {
    const h = document.createElement('h3');
    h.id = 'sec-8-9';
    const spy = jest.fn();
    h.scrollIntoView = spy;
    document.body.appendChild(h);
    expect(scrollToId('sec-8-9')).toBe(true);
    expect(spy).toHaveBeenCalled();
  });

  it('falls back to the [data-slug] hook when no element has the id', () => {
    // The heading's own id is the section id; a citation to the prose text slug lands
    // via data-slug.
    const h = document.createElement('h3');
    h.id = 'sec-8-9';
    h.setAttribute('data-slug', '8-9-powerbox');
    const spy = jest.fn();
    h.scrollIntoView = spy;
    document.body.appendChild(h);
    expect(scrollToId('8-9-powerbox')).toBe(true);
    expect(spy).toHaveBeenCalled();
  });

  it('returns false (no throw) when the fragment names nothing', () => {
    expect(scrollToId('nope')).toBe(false);
  });

  it('returns false for an empty id without touching the DOM', () => {
    expect(scrollToId('')).toBe(false);
  });

  it('does not throw on a fragment with CSS-special characters', () => {
    expect(() => scrollToId('a"b\\c')).not.toThrow();
  });
});
