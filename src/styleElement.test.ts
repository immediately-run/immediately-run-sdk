/**
 * @jest-environment jsdom
 */
import { ensureStyleElement } from './styleElement';

describe('ensureStyleElement', () => {
  beforeEach(() => {
    document.head.innerHTML = '<style id="app">h1{}</style>';
  });

  it('appends by default and injects once per id', () => {
    ensureStyleElement('x', 'a{}');
    ensureStyleElement('x', 'b{}');
    expect(document.querySelectorAll('#x')).toHaveLength(1);
    expect(document.getElementById('x')!.textContent).toBe('a{}');
    expect(document.head.lastElementChild?.id).toBe('x');
  });

  it('with first: true goes before every existing stylesheet', () => {
    ensureStyleElement('y', 'a{}', { first: true });
    expect(document.head.firstElementChild?.id).toBe('y');
  });
});
