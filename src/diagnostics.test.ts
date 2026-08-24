// R3-74 — the diagnostics:read channel surface (LLM_AND_AGENTS_SPEC §3.3/§4).
// Driven against a mocked transport: assert the get/onChange/use trio, the poll on
// first read, the parse (require arrays, tolerate partial provenance), and that a
// malformed push leaves the last good snapshot standing. The channel is a module
// singleton, so each test resets modules + re-requires for a fresh channel.
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

import type { Diagnostics } from './diagnostics';

type DiagMod = typeof import('./diagnostics');
let mod: DiagMod;
const push = (msg: Record<string, unknown>) => (listeners['diagnostics'] || []).forEach((l) => l(msg));

beforeEach(() => {
  jest.resetModules();
  for (const k of Object.keys(listeners)) delete listeners[k];
  sendMessage.mockReset();
  mod = require('./diagnostics');
});

const sample = {
  buildErrors: [{ message: "Cannot find name 'foo'", path: '/src/App.tsx', line: 3, column: 9 }],
  consoleEntries: [{ level: 'error', text: 'boom', at: 123 }],
  provenance: { appKey: 'github/acme/app', compileId: 'c7' },
};

it('polls request-diagnostics on first read and starts empty', () => {
  expect(mod.getDiagnostics()).toEqual({ buildErrors: [], consoleEntries: [], provenance: null });
  expect(sendMessage).toHaveBeenCalledWith('request-diagnostics');
});

it('onDiagnosticsChange replays current then fires on each push, parsing fully', () => {
  const seen: Diagnostics[] = [];
  const off = mod.onDiagnosticsChange((d) => seen.push(d));
  expect(seen).toHaveLength(1); // immediate replay of the empty initial
  push(sample);
  expect(seen[1].buildErrors[0].message).toBe("Cannot find name 'foo'");
  expect(seen[1].consoleEntries[0]).toEqual({ level: 'error', text: 'boom', at: 123 });
  expect(seen[1].provenance).toEqual({ appKey: 'github/acme/app', compileId: 'c7' });
  off();
  push(sample); // unsubscribed → no further calls
  expect(seen).toHaveLength(2);
});

it('tolerates a missing provenance (null)', () => {
  let got: Diagnostics | undefined;
  mod.onDiagnosticsChange((d) => (got = d));
  push({ buildErrors: [], consoleEntries: [] });
  expect(got!.provenance).toBeNull();
});

it('ignores a malformed push (non-array fields) — last good snapshot stands', () => {
  const seen: Diagnostics[] = [];
  mod.onDiagnosticsChange((d) => seen.push(d));
  push(sample);
  const goodLen = seen.length;
  push({ buildErrors: 'nope', consoleEntries: null }); // malformed → ignored
  expect(seen).toHaveLength(goodLen);
  expect(mod.getDiagnostics().buildErrors).toHaveLength(1);
});
