// `throwOnRefusal` — the one unwrap, and the reason this file exists at all.
//
// Round 2 caught the branch with `npm run verify` RED: `check:untested` flags a changed
// logic file with no sibling test, and it diffs `merge-base..HEAD`, so while
// `protocolRefusal.ts` was still UNTRACKED the gate could not see it and `verify` passed.
// It went red the moment the file was committed — after the run that was quoted as green.
// Verify the COMMITTED head.
//
// What this pins, beyond "it throws":
//
//  1. the ENVELOPE's `ok` is the only success test, and `true` means `true` — not truthy;
//  2. an under-specified refusal is still a refusal, never a success;
//  3. the tightening the extraction introduced: `code`/`message` must be STRINGS. The five
//     call sites this replaced tested for PRESENCE, so `code: 42` surfaced as the number 42
//     on a field typed `string`. Nothing pinned that before, so a revert stayed green;
//  4. the double-envelope shape is NOT read as a refusal — the deliberate non-behaviour.
import { throwOnRefusal } from './protocolRefusal';

const thrown = (res: unknown, fallback = 'fallback message') => {
  try {
    throwOnRefusal(res, fallback);
  } catch (e) {
    return e as Error & { code: unknown };
  }
  return undefined;
};

describe('the envelope says the call succeeded', () => {
  it('returns for `{ ok: true }`', () => {
    expect(() => throwOnRefusal({ ok: true }, 'f')).not.toThrow();
  });

  it('returns for `{ ok: true, data }` — the dispatcher shape for a handler return', () => {
    expect(() => throwOnRefusal({ ok: true, data: { anything: 1 } }, 'f')).not.toThrow();
  });

  it('a payload that itself carries `ok: false` is STILL a success — the deliberate non-behaviour', () => {
    // This is the double-envelope trap (R3-778). Reading `data.ok` here would make a
    // success whose legitimate payload happens to contain `ok: false` into a refusal, and
    // would bless a second reply contract. The fix belongs in the host.
    expect(() => throwOnRefusal({ ok: true, data: { ok: false, code: 'declined' } }, 'f')).not.toThrow();
  });
});

describe('anything else is a refusal', () => {
  it.each([
    ['an explicit refusal', { ok: false, code: 'forbidden', message: 'nope' }, 'forbidden', 'nope'],
    ['no code', { ok: false, message: 'nope' }, 'unknown', 'nope'],
    ['no message', { ok: false, code: 'forbidden' }, 'forbidden', 'fallback message'],
    ['neither', { ok: false }, 'unknown', 'fallback message'],
    ['an empty object', {}, 'unknown', 'fallback message'],
    ['undefined', undefined, 'unknown', 'fallback message'],
    ['null', null, 'unknown', 'fallback message'],
    ['a string reply', 'nope', 'unknown', 'fallback message'],
  ])('%s', (_label, res, code, message) => {
    const err = thrown(res);
    expect(err).toBeInstanceOf(Error);
    expect(err?.code).toBe(code);
    expect(err?.message).toBe(message);
  });

  it.each([
    ['ok: "true" (the string)', { ok: 'true' }],
    ['ok: 1', { ok: 1 }],
    ['ok: {}', { ok: {} }],
  ])('%s is not `true` — truthy is not the test', (_label, res) => {
    expect(thrown(res)?.code).toBe('unknown');
  });
});

describe('code and message must be strings (the extraction tightened this)', () => {
  // The old form was `(res?.code as Code) ?? 'unknown'` and `res?.message ?? fallback`,
  // which tested PRESENCE. A host sending a number got it through onto a field the type
  // declares `string`, and app code branching on `err.code === 'declined'` would silently
  // never match. Reverting either line to the `??` form reddens one of these.
  it.each([
    ['a numeric code', { ok: false, code: 42 }],
    ['a null code', { ok: false, code: null }],
    ['an object code', { ok: false, code: { toString: () => 'forbidden' } }],
  ])('%s falls back to `unknown` rather than being passed through', (_label, res) => {
    const err = thrown(res);
    expect(err?.code).toBe('unknown');
    expect(typeof err?.code).toBe('string');
  });

  it.each([
    ['a numeric message', { ok: false, message: 42 }],
    ['a null message', { ok: false, message: null }],
  ])('%s falls back rather than being stringified', (_label, res) => {
    expect(thrown(res)?.message).toBe('fallback message');
  });
});

it('the thrown value is a real Error, so a catch that reads `.stack` or rethrows works', () => {
  const err = thrown({ ok: false, code: 'forbidden' });
  expect(err).toBeInstanceOf(Error);
  expect(typeof err?.stack).toBe('string');
});
