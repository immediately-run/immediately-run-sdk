/**
 * @jest-environment jsdom
 */
// R3-613 — the in-app status primitives (R-IX-2/R-IX-3). jsdom fires no live-
// region announcements, so what is asserted is the DOM contract: the region, its
// politeness, the named busy box with aria-busy, and the flash floor riding the
// LOADING_TIMINGS token (no second timing language).
// Uses the SDK's createRoot + act test convention (see loading.test.tsx).
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Busy, Status } from './status';
import { LOADING_TIMINGS } from './loading';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function renderC(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  return {
    container,
    rerender: (u: React.ReactElement) => act(() => root.render(u)),
    unmount: () => act(() => root.unmount()),
  };
}

beforeEach(() => {
  jest.useRealTimers();
  document.body.innerHTML = '';
});

describe('Status — the live region (4.1.3)', () => {
  it('is a role=status region, polite by default', () => {
    const { container } = renderC(<Status>Saved</Status>);
    const region = container.firstElementChild as HTMLElement;
    expect(region.getAttribute('role')).toBe('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toBe('Saved');
  });

  it('goes assertive only on opt-in', () => {
    const { container } = renderC(<Status assertive>Upload failed</Status>);
    expect((container.firstElementChild as HTMLElement).getAttribute('aria-live')).toBe('assertive');
  });

  it('a content change inside the MOUNTED region announces — the region itself never remounts', () => {
    const { container, rerender } = renderC(<Status> </Status>);
    const region = container.firstElementChild as HTMLElement;
    expect(region.textContent).toBe(' ');
    rerender(<Status>Saved</Status>);
    // Same node, new content — the announce contract (a remount would announce nothing).
    expect(container.firstElementChild).toBe(region);
    expect(region.textContent).toBe('Saved');
  });
});

describe('Busy — R-IX-2 as a component', () => {
  it('keeps its box, renders the named label, carries aria-busy', () => {
    const { container } = renderC(<Busy label="Saving…" floorMs={0} />);
    const box = container.firstElementChild as HTMLElement;
    expect(box.getAttribute('aria-busy')).toBe('true');
    expect(box.textContent).toBe('Saving…');
    // The box is a real element occupying the control's label slot.
    expect(box.tagName).toBe('SPAN');
  });

  it('below the flash floor the label is not shown — then it is', () => {
    jest.useFakeTimers();
    const { container } = renderC(<Busy label="Connecting…" />);
    const box = container.firstElementChild as HTMLElement;
    expect(box.getAttribute('aria-busy')).toBe('true');
    expect(box.textContent).toBe(''); // the box, nothing flashed
    act(() => jest.advanceTimersByTime(LOADING_TIMINGS.spinThresholdMs));
    expect(box.textContent).toBe('Connecting…');
  });

  it('the default floor IS the LOADING_TIMINGS token — no second timing language', () => {
    expect(LOADING_TIMINGS.spinThresholdMs).toBeGreaterThan(0); // the token is the source, imported once
    jest.useFakeTimers();
    const { container } = renderC(<Busy label="Saving…" />);
    act(() => jest.advanceTimersByTime(LOADING_TIMINGS.spinThresholdMs - 1));
    expect((container.firstElementChild as HTMLElement).textContent).toBe('');
    act(() => jest.advanceTimersByTime(1));
    expect((container.firstElementChild as HTMLElement).textContent).toBe('Saving…');
  });

  it('floorMs 0 shows immediately — the caller who already waited opts out', () => {
    const { container } = renderC(<Busy label="Saving…" floorMs={0} />);
    expect((container.firstElementChild as HTMLElement).textContent).toBe('Saving…');
  });
});
