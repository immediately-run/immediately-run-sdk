/**
 * @jest-environment jsdom
 */
// R3-613 — the in-app dialog contract (interaction_standards R-IX-1), the SDK
// generalization of the host's R3-592 pair. Real components call the hooks; the
// same behavioural cases site-main's parity test runs against BOTH
// implementations live here for the SDK side alone.
// Uses the SDK's createRoot + act test convention (see loading.test.tsx).
import { act } from 'react';
import { useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Dialog, useDialogDismiss, useDialogFocus } from './dialog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function renderC(ui: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  return {
    container,
    rerender: (u: ReactNode) => act(() => root.render(u)),
    unmount: () => act(() => root.unmount()),
  };
}

const pressKey = (key: string, target: EventTarget = document): void => {
  act(() => target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
};

let dismissals: string[];

/** A real dialog component: the hooks wired over a role=dialog root. `extra`
 *  mounts additional content AFTER the first render (the late-focusable case). */
function TestDialog({
  id,
  enabled = true,
  lateFocusable = false,
}: {
  id: string;
  enabled?: boolean;
  lateFocusable?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [late, setLate] = useState(false);
  useDialogDismiss(() => dismissals.push(id), { enabled });
  useDialogFocus(ref, { enabled });
  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label={id} tabIndex={-1}>
      <button onClick={() => setLate(true)}>one-{id}</button>
      {(late || lateFocusable) && <button>two-{id}</button>}
    </div>
  );
}

beforeEach(() => {
  dismissals = [];
  document.body.innerHTML = '';
});

describe('useDialogDismiss — the stack (R3-613 / R-IX-1)', () => {
  it('with two dialogs mounted, Escape reaches only the top', () => {
    const a = renderC(<TestDialog id="a" />);
    const b = renderC(<TestDialog id="b" />);

    pressKey('Escape');
    expect(dismissals).toEqual(['b']);
    b.unmount();

    pressKey('Escape');
    expect(dismissals).toEqual(['b', 'a']);
    a.unmount();
  });

  it('unmounting a NON-top entry keeps the stack correct', () => {
    const a = renderC(<TestDialog id="a" />);
    const b = renderC(<TestDialog id="b" />);
    const c = renderC(<TestDialog id="c" />);

    b.unmount(); // the middle entry leaves out of order
    pressKey('Escape');
    expect(dismissals).toEqual(['c']);
    c.unmount();
    pressKey('Escape');
    expect(dismissals).toEqual(['c', 'a']);
    a.unmount();
  });

  it('an empty stack leaves no listener behind (spied removeEventListener)', () => {
    const removeSpy = jest.spyOn(document, 'removeEventListener');
    const addSpy = jest.spyOn(document, 'addEventListener');

    const a = renderC(<TestDialog id="a" />);
    const b = renderC(<TestDialog id="b" />);
    // ONE listener serves both.
    expect(addSpy.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1);

    b.unmount();
    a.unmount();
    expect(removeSpy.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1);
    removeSpy.mockRestore();
    addSpy.mockRestore();
  });

  it('enabled: false registers nothing and Escape dismisses nothing', () => {
    const addSpy = jest.spyOn(document, 'addEventListener');
    const a = renderC(<TestDialog id="a" enabled={false} />);
    expect(addSpy.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(0);

    pressKey('Escape');
    expect(dismissals).toEqual([]);
    a.unmount();
    addSpy.mockRestore();
  });
});

describe('useDialogFocus — in, wrap, restore (R3-613 / R-IX-1)', () => {
  it('focus lands on the first focusable on mount', () => {
    const invoker = document.createElement('button');
    document.body.appendChild(invoker);
    invoker.focus();

    const { container } = renderC(<TestDialog id="a" />);
    const first = (container.querySelector('button') as HTMLElement)!;
    expect(document.activeElement).toBe(first);
  });

  it('with no focusable child, focus falls back to the dialog root', () => {
    function Rootless() {
      const ref = useRef<HTMLDivElement>(null);
      useDialogDismiss(() => {});
      useDialogFocus(ref);
      return (
        <div ref={ref} role="dialog" aria-modal="true" aria-label="rootless" tabIndex={-1}>
          text only
        </div>
      );
    }
    const { container } = renderC(<Rootless />);
    expect(document.activeElement).toBe(container.firstElementChild);
  });

  it('Tab wraps, including a focusable added after mount', () => {
    const { container, rerender } = renderC(<TestDialog id="a" />);
    rerender(<TestDialog id="a" lateFocusable />);
    const buttons = () => Array.from(container.querySelectorAll('button'));
    buttons()[1].focus(); // the late-mounted one is now the last
    expect(document.activeElement).toBe(buttons()[1]);

    pressKey('Tab', document.activeElement!);
    expect(document.activeElement).toBe(buttons()[0]); // wrapped forward past the last

    const shift = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true });
    act(() => document.activeElement!.dispatchEvent(shift));
    expect(document.activeElement).toBe(buttons()[1]); // wrapped backward past the first
  });

  it('unmount restores the invoker', () => {
    const invoker = document.createElement('button');
    document.body.appendChild(invoker);
    invoker.focus();

    const a = renderC(<TestDialog id="a" />);
    expect(document.activeElement).not.toBe(invoker);
    a.unmount();
    expect(document.activeElement).toBe(invoker);
  });

  it('an invoker that unmounted first does not throw on dialog unmount', () => {
    const invoker = document.createElement('button');
    document.body.appendChild(invoker);
    invoker.focus();

    const a = renderC(<TestDialog id="a" />);
    invoker.remove(); // the invoker's host tears it down before the dialog closes
    expect(() => a.unmount()).not.toThrow();
  });
});

describe('Dialog — the composition (R3-613)', () => {
  it('renders role=dialog aria-modal with the accessible name, and composes both hooks', () => {
    const invoker = document.createElement('button');
    document.body.appendChild(invoker);
    invoker.focus();

    const { container, unmount } = renderC(
      <Dialog onDismiss={() => dismissals.push('d')} aria-label="Example">
        <button>inside</button>
      </Dialog>,
    );
    const node = container.firstElementChild as HTMLElement;
    expect(node.getAttribute('role')).toBe('dialog');
    expect(node.getAttribute('aria-modal')).toBe('true');
    expect(node.getAttribute('aria-label')).toBe('Example');
    expect(document.activeElement).toBe(node.querySelector('button'));

    pressKey('Escape');
    expect(dismissals).toEqual(['d']);
    unmount();
    expect(document.activeElement).toBe(invoker);
  });
});
