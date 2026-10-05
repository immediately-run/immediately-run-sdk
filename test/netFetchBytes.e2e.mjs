// R3-861 — `hostFetch(url, { responseType: 'bytes' })` over the BUILT SDK: the
// request carries the field, and the reply's `bodyBytes` come back as a real
// Uint8Array — the exact bytes, never a text decode.
//
// Driven the way the repo's transport tests are (a controllable transport, here
// the §4 discovery global the npm-fetched path resolves) but against dist/, like
// the other *.e2e.mjs suites — the shape an app actually loads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// The §4 discovery global, installed BEFORE the dist module is touched. Records
// the requests; answers with a canned reply carrying real bytes.
const seen = [];
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0x00, 0x80, 0x7f]);
globalThis.__immediatelyRun__ = {
  transport: {
    sendMessage: () => {},
    protocolRequest: async (name, method, params) => {
      seen.push({ name, method, params });
      return {
        ok: true,
        data: { status: 200, statusText: 'OK', headers: {}, body: '', truncated: false, bodyBytes: PNG },
      };
    },
    onMessage: () => ({ dispose: () => {} }),
  },
};

const { hostFetch } = await import(pathToFileURL(join(root, 'dist', 'netFetch.js')).href);

test("hostFetch with responseType: 'bytes' sends the field and returns the exact bytes", async () => {
  const res = await hostFetch('https://api.example.com/poster.png', { responseType: 'bytes' });
  // The field went over the wire.
  const req = seen.find((r) => r.method === 'fetch');
  assert.ok(req, 'a fetch request was sent');
  assert.equal(req.params[0].responseType, 'bytes');
  // …and the bytes came back byte-identical, as a Uint8Array, with body empty.
  assert.ok(res.bodyBytes instanceof Uint8Array);
  assert.deepEqual([...res.bodyBytes], [...PNG]);
  assert.equal(res.body, '');
});

test('the default request sends NO responseType key (the text path is unchanged)', async () => {
  await hostFetch('https://api.example.com/data.json');
  const req = seen[seen.length - 1];
  assert.ok(!('responseType' in req.params[0]), 'no responseType key on a default request');
});
