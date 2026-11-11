/**
 * @jest-environment jsdom
 */
// ProviderIcon's behaviour (R3-1141): one sprite node per document however many icons
// render, and the lettermark fallback for an unknown id.

import { cleanup, render } from '@testing-library/react';
import { createElement as h } from 'react';
import { ProviderIcon } from './ProviderIcon';

afterEach(() => {
  cleanup();
  // The sprite lives on document.body, outside the rendered tree — cleanup() alone
  // leaves it, and the unknown-id case asserts its absence.
  document.getElementById('ir-provider-icon-sprite')?.remove();
});

describe('ProviderIcon', () => {
  it('two icons inject exactly one sprite node', () => {
    render(
      h(
        'div',
        null,
        h(ProviderIcon, { id: 'anthropic', label: 'Anthropic' }),
        h(ProviderIcon, { id: 'openrouter', label: 'OpenRouter' }),
      ),
    );
    expect(document.querySelectorAll('#ir-provider-icon-sprite')).toHaveLength(1);
    expect(document.querySelectorAll('use[href="#pi-anthropic"]')).toHaveLength(1);
    expect(document.querySelectorAll('use[href="#pi-openrouter"]')).toHaveLength(1);
  });

  it('a remount does not re-inject', () => {
    const { unmount } = render(h(ProviderIcon, { id: 'anthropic', label: 'Anthropic' }));
    unmount();
    render(h(ProviderIcon, { id: 'anthropic', label: 'Anthropic' }));
    expect(document.querySelectorAll('#ir-provider-icon-sprite')).toHaveLength(1);
  });

  it('an unknown id renders the lettermark with the label as the accessible name', () => {
    const { getByRole, container } = render(h(ProviderIcon, { id: 'not-a-provider', label: 'Mystery' }));
    const el = getByRole('img', { name: 'Mystery' });
    expect(el.textContent).toBe('M');
    expect(container.querySelector('svg')).toBeNull();
    expect(document.getElementById('ir-provider-icon-sprite')).toBeNull();
  });

  it('a known id renders an svg with the accessible name', () => {
    const { getByRole } = render(h(ProviderIcon, { id: 'anthropic', label: 'Anthropic' }));
    expect(getByRole('img', { name: 'Anthropic' }).tagName).toBe('svg');
  });
});
