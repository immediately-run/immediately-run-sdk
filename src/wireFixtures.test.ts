/**
 * The SDK's half of the R3-274e1 cross-side proof — the mirror of the frame's
 * `src/protocol/wireFixtures.test.ts`.
 *
 * `protocol:check` proves this repo's source matches the pinned contract. It cannot
 * prove this side and the frame agree with EACH OTHER: the two snapshots are
 * projections of one descriptor set, so they agree by construction until someone edits
 * the descriptors — and then they disagree quietly, because nothing reads both. Both
 * repos therefore drive the SAME object, published once as
 * `@immediately-run/sandbox-protocol/fixtures`.
 *
 * The property that makes it a cross-side proof rather than two assertions that happen
 * to agree: deleting a field from a fixture fails BOTH sides. For `fs-change.epoch` it
 * trips two independent things on this side alone — `value.fields` declares it, and
 * `payload.reads` names it — plus the frame's `payload.fields`.
 *
 * `./hostTransport` is mocked so host pushes are deterministic, which lets the REAL
 * `parse` inside each channel run. Mocking the channel itself would prove nothing:
 * `parse` is the code that decides whether the fixture is understood.
 */
jest.mock('./hostTransport', () => {
  const handlers = new Map<string, (msg: Record<string, unknown>) => void>();
  return {
    sendMessage: jest.fn(),
    addListener: jest.fn((type: string, handler: (msg: Record<string, unknown>) => void) => {
      handlers.set(type, handler);
      return () => handlers.delete(type);
    }),
    // test-only: deliver a host push exactly as the transport would
    __push: (type: string, msg: Record<string, unknown>) => handlers.get(type)?.({ ...msg, type }),
    __types: () => [...handlers.keys()],
  };
});

import { readFileSync } from 'node:fs';

import { WIRE_FIXTURES, shapeProblems } from '@immediately-run/sandbox-protocol/fixtures';
import type { ProtocolSnapshot, WireShape } from '@immediately-run/sandbox-protocol';
// Read as bytes, not `import`: this repo's tsconfig deliberately has no
// `resolveJsonModule` (it would change what the published build emits), and the
// snapshot is data the test reads, not a module the SDK ships.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const snapshot = JSON.parse(readFileSync(require.resolve('@immediately-run/sandbox-protocol/snapshots/sdk'), 'utf8'));

import { getFsChange, onFsChange } from './onFsChange';
import { getEditorContext, onEditorContextChange } from './editorContext';
import { sdkHandshake } from './runtime';
import { EDITOR_CONTEXT, FS_CHANGE, SDK_HANDSHAKE } from './generated/protocol';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const bus = jest.requireMock('./hostTransport') as any as {
  __push: (type: string, msg: Record<string, unknown>) => void;
};

const snap = snapshot as unknown as ProtocolSnapshot;

/** Every shape this side declares for a name that carries structure. */
const declaredShapes = (name: string): WireShape[] => {
  const c = snap.channels[name];
  return [c.payload, c.value].filter((s): s is WireShape => !!s?.fields);
};

describe('the shared wire fixture conforms to the SDK’s declarations', () => {
  it.each(['fs-change', 'editor-context', 'sdk-handshake'])('%s', (name) => {
    const shapes = declaredShapes(name);
    // Guard the vacuous pass: a fixture checked against zero shapes asserts nothing.
    expect(shapes.length).toBeGreaterThan(0);
    for (const shape of shapes) {
      expect({ name, problems: shapeProblems(shape, WIRE_FIXTURES[name]) }).toEqual({
        name,
        problems: [],
      });
    }
  });

  it('supplies every key this side declares it READS', () => {
    // The other half of the deletion property. `fs-change.payload` on this side has no
    // `fields` — only `reads` — so a shape check alone would not notice `epoch` going
    // missing from the message the SDK is handed.
    for (const name of Object.keys(WIRE_FIXTURES)) {
      const c = snap.channels[name];
      for (const key of [...(c.payload?.reads ?? []), ...(c.value?.reads ?? [])]) {
        expect({ name, key, present: key in WIRE_FIXTURES[name] }).toEqual({
          name,
          key,
          present: true,
        });
      }
    }
  });

  it('the fixture names are spelled by this side’s own constants', () => {
    expect(Object.keys(WIRE_FIXTURES).sort()).toEqual([EDITOR_CONTEXT, FS_CHANGE, SDK_HANDSHAKE].sort());
  });
});

describe('the SDK’s real parsers accept the shared fixture', () => {
  it('fs-change: onFsChange surfaces BOTH fields, epoch included', () => {
    const seen: Array<{ paths: string[]; epoch: number }> = [];
    onFsChange((c) => seen.push(c));
    // The subscription fires immediately with the empty initial, then on the push.
    expect(seen[0]).toEqual({ paths: [], epoch: 0 });

    bus.__push(FS_CHANGE, { ...WIRE_FIXTURES['fs-change'] });

    const fixture = WIRE_FIXTURES['fs-change'] as unknown as { paths: string[]; epoch: number };
    expect(seen[seen.length - 1]).toEqual({ paths: fixture.paths, epoch: fixture.epoch });
    expect(getFsChange()).toEqual({ paths: fixture.paths, epoch: fixture.epoch });
    // `epoch` is exactly what the frame does NOT read — this side is why it stayed on
    // the wire, so assert it arrived rather than defaulting back to the initial 0.
    expect(getFsChange().epoch).not.toBe(0);
  });

  it('editor-context: all FOUR fields survive the parse', () => {
    const seen: unknown[] = [];
    onEditorContextChange((c) => seen.push(c));
    bus.__push(EDITOR_CONTEXT, { ...WIRE_FIXTURES['editor-context'] });

    // The SDK is the side that surfaces the whole message to apps (the frame caches a
    // subset), so here the assertion is equality with the fixture, not a subset of it.
    expect(getEditorContext()).toEqual(WIRE_FIXTURES['editor-context']);
    expect(seen[seen.length - 1]).toEqual(WIRE_FIXTURES['editor-context']);
  });

  it('sdk-handshake: what this side PRODUCES fits the same shape the fixture does', () => {
    // This name's parser on this side is the producer. Two legitimate producers share
    // the name — this SDK announces the versions it owns, the frame its own — which is
    // why the resolution made every field optional.
    const produced = sdkHandshake() as unknown as Record<string, unknown>;
    for (const shape of declaredShapes('sdk-handshake')) {
      expect(shapeProblems(shape, produced)).toEqual([]);
    }
    // An all-empty payload would also conform, every field being optional — so assert
    // this side really populates the field it owns.
    expect(typeof produced.sdkVersion).toBe('string');
  });
});

describe('the fixture is falsifiable on THIS side too', () => {
  // Without this the suite above would pass against a validator that returns [] for
  // everything, making the cross-side claim vacuous here even while it holds in the
  // protocol package.
  it('a fs-change missing epoch is rejected by the declaration AND by the parser', () => {
    const broken = { ...WIRE_FIXTURES['fs-change'] } as Record<string, unknown>;
    delete broken.epoch;

    const problems = declaredShapes('fs-change').flatMap((s) => shapeProblems(s, broken));
    expect(problems).toContain('$.epoch: required by the declaration, absent');

    // And the real parser rejects it too — `parse` returns undefined, so the channel
    // keeps its previous value instead of adopting a half-message.
    const before = getFsChange();
    bus.__push(FS_CHANGE, broken);
    expect(getFsChange()).toEqual(before);
  });
});
