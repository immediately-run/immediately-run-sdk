/**
 * @jest-environment jsdom
 */
// System-app devtools SDK surface (plan: docs/plans/system-app-devtools.md).
// Driven against a mocked transport: the dev gate keeps `debug.log` and the
// DOM responder inert until the host pushes `debug-enabled`, then both work; the
// responder's vocabulary is CLOSED (read verbs + the bounded action verbs below) and
// contains no eval bridge. Module-singleton channels →
// reset modules + re-require per test.
type Listener = (msg: Record<string, unknown>) => void;
const listeners: Record<string, Listener[]> = {};
const sendMessage = jest.fn();

jest.mock('./hostTransport', () => ({
  sendMessage: (...args: unknown[]) => sendMessage(...args),
  addListener: (type: string, h: Listener) => {
    (listeners[type] ||= []).push(h);
    return () => {
      listeners[type] = (listeners[type] || []).filter((x) => x !== h);
    };
  },
}));

type DebugMod = typeof import('./debug');
let mod: DebugMod;

const push = (type: string, msg: Record<string, unknown>) =>
  (listeners[type] || []).forEach((l) => l({ type, ...msg }));
const enable = () => push('debug-enabled', { enabled: true });

beforeEach(() => {
  jest.resetModules();
  for (const k of Object.keys(listeners)) delete listeners[k];
  sendMessage.mockReset();
  mod = require('./debug');
});

describe('dev gate', () => {
  it('starts disabled and polls the host', () => {
    expect(mod.isDebugEnabled()).toBe(false);
    expect(sendMessage).toHaveBeenCalledWith('request-debug-enabled');
  });

  it('flips on when the host pushes debug-enabled', () => {
    mod.isDebugEnabled(); // start the channel
    enable();
    expect(mod.isDebugEnabled()).toBe(true);
  });
});

describe('debug.log', () => {
  it('is a no-op until enabled (sends no debug-log)', () => {
    mod.debug.log('info', 'hi', { a: 1 });
    expect(sendMessage).not.toHaveBeenCalledWith('debug-log', expect.anything());
  });

  it('sends a structured entry once enabled', () => {
    mod.isDebugEnabled();
    enable();
    mod.debug.log('warn', 'careful', { n: 2 });
    expect(sendMessage).toHaveBeenCalledWith('debug-log', {
      level: 'warn',
      message: 'careful',
      data: { n: 2 },
    });
  });

  it('never throws on unserializable data', () => {
    mod.isDebugEnabled();
    enable();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => mod.debug.log('error', 'boom', circular)).not.toThrow();
    expect(sendMessage).toHaveBeenCalledWith(
      'debug-log',
      expect.objectContaining({ level: 'error', message: 'boom', data: '[unserializable]' }),
    );
  });
});

describe('DOM/layout read verbs', () => {
  const lastResult = () => {
    const calls = sendMessage.mock.calls.filter((c) => c[0] === 'debug-query-result');
    return calls.length ? (calls[calls.length - 1][1] as Record<string, unknown>) : undefined;
  };

  beforeEach(() => {
    document.body.innerHTML = '<div id="app" class="editor-app"><span role="tab">App.tsx</span></div>';
  });

  it('ignores queries while the gate is closed', () => {
    push('debug-query', { id: 1, method: 'rect', params: { selector: '#app' } });
    expect(lastResult()).toBeUndefined();
  });

  it('answers snapshotDom with a bounded structured tree once enabled', () => {
    mod.isDebugEnabled();
    enable();
    push('debug-query', { id: 7, method: 'snapshotDom', params: { selector: '#app' } });
    const res = lastResult();
    expect(res).toMatchObject({ id: 7, ok: true });
    const tree = res!.result as { tag: string; id?: string; classes?: string[]; children?: unknown[] };
    expect(tree.tag).toBe('div');
    expect(tree.id).toBe('app');
    expect(tree.classes).toContain('editor-app');
    expect(Array.isArray(tree.children)).toBe(true);
  });

  it('rejects an unknown method (closed vocabulary, no eval)', () => {
    mod.isDebugEnabled();
    enable();
    push('debug-query', { id: 9, method: 'eval', params: { code: 'window.x=1' } });
    const res = lastResult();
    expect(res).toMatchObject({ id: 9, ok: false });
    expect(String(res!.error)).toMatch(/unknown debug method/);
  });
});

// ── R3-423: bounded input injection (dispatchPointer / dispatchKey) ───────────
//
// The security shape matters more than the happy path here: these are the only ACTION
// verbs on a responder that is otherwise all reads, and whose header promises no eval.
// These cases pin the bounds — closed type vocabulary, clamped coordinates, a button
// state of "none" or "primary held" only, no arbitrary property bag, and the same dev
// gate — so a later "just let the caller pass an init object" convenience fails CI
// instead of quietly reopening the surface.
describe('bounded input injection (R3-423)', () => {
  const lastResult = () => {
    const calls = sendMessage.mock.calls.filter((c) => c[0] === 'debug-query-result');
    return calls.length ? (calls[calls.length - 1][1] as Record<string, unknown>) : undefined;
  };

  beforeEach(() => {
    document.body.innerHTML = '<canvas id="stage" width="200" height="100"></canvas>';
    // jsdom has no layout, so elementFromPoint answers null; pin it at the canvas so
    // the hit-test path is exercised rather than skipped.
    const canvas = document.getElementById('stage')!;
    (document as unknown as { elementFromPoint: (x: number, y: number) => Element | null }).elementFromPoint = () =>
      canvas;
  });

  const enabled = () => {
    mod.isDebugEnabled();
    enable();
  };

  it('is INERT while the gate is closed (no event, no reply)', () => {
    let hits = 0;
    document.getElementById('stage')!.addEventListener('pointerdown', () => (hits += 1));
    push('debug-query', { id: 1, method: 'dispatchPointer', params: { type: 'pointerdown', x: 10, y: 10 } });
    expect(hits).toBe(0);
    expect(lastResult()).toBeUndefined();
  });

  it('delivers a pointer event to whatever is at the point, and reports the target', () => {
    enabled();
    const seen: Array<{ x: number; y: number; trusted: boolean }> = [];
    document
      .getElementById('stage')!
      .addEventListener('pointerdown', (e) =>
        seen.push({ x: (e as PointerEvent).clientX, y: (e as PointerEvent).clientY, trusted: e.isTrusted }),
      );
    push('debug-query', { id: 2, method: 'dispatchPointer', params: { type: 'pointerdown', x: 42, y: 17 } });
    expect(lastResult()).toMatchObject({ id: 2, ok: true });
    expect(seen).toEqual([{ x: 42, y: 17, trusted: false }]);
    // isTrusted:false is THE property that keeps this from being an escalation: a
    // synthetic event can never satisfy a user-activation gate.
    expect((lastResult()!.result as { target: string }).target).toBe('canvas');
  });

  it('CLAMPS coordinates into the viewport (no negative / off-screen aiming)', () => {
    enabled();
    const seen: Array<{ x: number; y: number }> = [];
    document
      .getElementById('stage')!
      .addEventListener('click', (e) => seen.push({ x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY }));
    push('debug-query', { id: 3, method: 'dispatchPointer', params: { type: 'click', x: -500, y: 10 ** 9 } });
    expect(seen[0].x).toBe(0);
    expect(seen[0].y).toBeLessThanOrEqual(window.innerHeight);
    expect(seen[0].y).toBeGreaterThanOrEqual(0);
  });

  it('falls back to a click for an out-of-vocabulary event type', () => {
    enabled();
    let clicks = 0;
    let contextmenus = 0;
    document.getElementById('stage')!.addEventListener('click', () => (clicks += 1));
    document.getElementById('stage')!.addEventListener('contextmenu', () => (contextmenus += 1));
    push('debug-query', { id: 4, method: 'dispatchPointer', params: { type: 'contextmenu', x: 1, y: 1 } });
    expect(contextmenus).toBe(0);
    expect(clicks).toBe(1);
  });

  it('ignores an arbitrary property bag (a caller cannot forge isTrusted)', () => {
    enabled();
    const seen: Event[] = [];
    document.getElementById('stage')!.addEventListener('pointerdown', (e) => seen.push(e));
    push('debug-query', {
      id: 5,
      method: 'dispatchPointer',
      params: { type: 'pointerdown', x: 5, y: 5, isTrusted: true, view: 'nope', detail: 99 },
    });
    expect(seen[0].isTrusted).toBe(false);
    expect((seen[0] as MouseEvent).detail).not.toBe(99);
  });

  it('dispatches a key event by NAME and refuses an empty one', () => {
    enabled();
    const keys: string[] = [];
    document.addEventListener('keydown', (e) => keys.push(e.key));
    push('debug-query', { id: 6, method: 'dispatchKey', params: { type: 'keydown', key: 'ArrowLeft' } });
    expect(keys).toEqual(['ArrowLeft']);
    expect(lastResult()).toMatchObject({ id: 6, ok: true });

    push('debug-query', { id: 7, method: 'dispatchKey', params: { type: 'keydown' } });
    expect(lastResult()).toMatchObject({ id: 7, ok: false });
    expect(String(lastResult()!.error)).toMatch(/key name is required/);
  });

  it('still has NO eval bridge — no verb interprets caller code', () => {
    enabled();
    push('debug-query', { id: 8, method: 'dispatchScript', params: { code: 'window.x=1' } });
    expect(lastResult()).toMatchObject({ id: 8, ok: false });
    expect(String(lastResult()!.error)).toMatch(/unknown debug method/);
    expect((window as unknown as { x?: unknown }).x).toBeUndefined();
  });

  // ── button state (review of R3-423): a move is a HOVER unless asked otherwise ──
  // Every injected move used to carry `buttons: 1`, so a hover test could not be
  // written at all and a canvas app's `if (e.buttons)` drag branch fired on a plain
  // move — which defeats the verb for the apps it exists for.
  describe('pointer button state reflects the ask', () => {
    const moveButtons = (params: Record<string, unknown>): { buttons: number; button: number } => {
      const seen: Array<{ buttons: number; button: number }> = [];
      const el = document.getElementById('stage')!;
      const h = (e: Event) => seen.push({ buttons: (e as MouseEvent).buttons, button: (e as MouseEvent).button });
      el.addEventListener('pointermove', h);
      push('debug-query', {
        id: 100,
        method: 'dispatchPointer',
        params: { type: 'pointermove', x: 3, y: 3, ...params },
      });
      el.removeEventListener('pointermove', h);
      return seen[0];
    };

    it('a plain pointermove carries NO buttons (a hover is testable)', () => {
      enabled();
      expect(moveButtons({})).toEqual({ buttons: 0, button: -1 });
    });

    it('buttons:1 / drag:true asks for the primary button held', () => {
      enabled();
      expect(moveButtons({ buttons: 1 }).buttons).toBe(1);
      expect(moveButtons({ drag: true }).buttons).toBe(1);
    });

    it('the button state stays a CLOSED set — an arbitrary mask is not passed through', () => {
      enabled();
      // 7 (all three buttons) and a string are both outside the vocabulary; a move
      // that asks for them gets the default, not the ask.
      expect(moveButtons({ buttons: 7 }).buttons).toBe(0);
      expect(moveButtons({ buttons: '1' }).buttons).toBe(0);
    });

    it('a press is held and a release is not, whatever the caller asks', () => {
      enabled();
      const seen: Array<{ type: string; buttons: number }> = [];
      const el = document.getElementById('stage')!;
      for (const t of ['pointerdown', 'pointerup'])
        el.addEventListener(t, (e) => seen.push({ type: e.type, buttons: (e as MouseEvent).buttons }));
      push('debug-query', {
        id: 101,
        method: 'dispatchPointer',
        params: { type: 'pointerdown', x: 1, y: 1, buttons: 0 },
      });
      push('debug-query', {
        id: 102,
        method: 'dispatchPointer',
        params: { type: 'pointerup', x: 1, y: 1, buttons: 1 },
      });
      expect(seen).toEqual([
        { type: 'pointerdown', buttons: 1 },
        { type: 'pointerup', buttons: 0 },
      ]);
    });
  });

  // ── legacy key fields (review of R3-423) ──────────────────────────────────────
  // `switch (e.keyCode)` is still how the arcade/canvas apps this verb targets read
  // input; a key with only `key`/`code` is invisible to them.
  describe('injected keys are visible to a legacy input loop', () => {
    const legacyOf = (params: Record<string, unknown>): { keyCode: number; which: number } => {
      const seen: Array<{ keyCode: number; which: number }> = [];
      const h = (e: Event) => seen.push({ keyCode: (e as KeyboardEvent).keyCode, which: (e as KeyboardEvent).which });
      document.addEventListener('keydown', h);
      push('debug-query', { id: 200, method: 'dispatchKey', params: { type: 'keydown', ...params } });
      document.removeEventListener('keydown', h);
      return seen[0];
    };

    it('populates keyCode/which consistently with key/code', () => {
      enabled();
      expect(legacyOf({ key: 'ArrowLeft' })).toEqual({ keyCode: 37, which: 37 });
      expect(legacyOf({ key: 'a' }).keyCode).toBe(65); // 'a' and 'A' both report 65
      expect(legacyOf({ key: 'A' }).keyCode).toBe(65);
      expect(legacyOf({ key: ' ' }).keyCode).toBe(32);
      expect(legacyOf({ key: 'Enter' }).keyCode).toBe(13);
      expect(legacyOf({ key: 'F5' }).keyCode).toBe(116);
      expect(legacyOf({ key: 'Dead', code: 'KeyW' }).keyCode).toBe(87); // falls back to `code`
      expect(legacyOf({ key: 'Unidentified' }).keyCode).toBe(0); // unknown, as a browser reports
    });

    it('a legacy `switch (e.keyCode)` loop observes the injected key', () => {
      enabled();
      let dx = 0;
      document.addEventListener('keydown', (e) => {
        // The shape this fix exists for — no `key`, no `code`.
        switch ((e as KeyboardEvent).keyCode) {
          case 37:
            dx -= 1;
            break;
          case 39:
            dx += 1;
            break;
        }
      });
      push('debug-query', { id: 201, method: 'dispatchKey', params: { type: 'keydown', key: 'ArrowRight' } });
      push('debug-query', { id: 202, method: 'dispatchKey', params: { type: 'keydown', key: 'ArrowRight' } });
      push('debug-query', { id: 203, method: 'dispatchKey', params: { type: 'keydown', key: 'ArrowLeft' } });
      expect(dx).toBe(1);
      expect(lastResult()).toMatchObject({ id: 203, ok: true });
    });
  });
});
