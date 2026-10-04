import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { init, handle, serve } from '../build/app.js';
import { storeHost, memoryStore } from '../adapters/store.mjs';
import { cases } from './cases.mjs';
import { freePort, startServer, verifyHttp } from './http-harness.mjs';
import { verifyNotes, httpCall } from './notes.mjs';

const host = storeHost();
const call = (store, method, path, body = '') => host.serveWith(serve, store, method, path, body);

test('generated Wasm JS contract (compiled-module entry)', async t => {
  const module = await WebAssembly.compile(await readFile(new URL('../build/app.wasm', import.meta.url)));
  await init(module, host.hooks);
  for (const c of cases) {
    await t.test(c.name, () => {
      assert.deepEqual(JSON.parse(handle(c.method, c.path, c.body ?? '')), { status: c.status, body: c.json, ...(c.allow ? { allow: c.allow } : {}) });
    });
  }
  await t.test('repeated string ownership', () => {
    for (let i = 0; i < 1000; i++) {
      assert.deepEqual(JSON.parse(handle('POST', '/greet', JSON.stringify({ name: `世界 ${i}` }))), {
        status: 200, body: { message: `Hello, 世界 ${i}!` },
      });
    }
  });
});

test('native HTTP contract', async t => {
  const port = await freePort();
  const server = await startServer('./build/server', [], port, { PORT: String(port) });
  t.after(server.stop);
  await verifyHttp(t, server.base);
});

test('generated Wasm notes: Almide reads and writes the store through async hooks', async t => {
  const store = memoryStore();
  await verifyNotes(t, async (method, path, body) => {
    const r = await call(store, method, path, body);
    return { status: r.status, allow: r.allow ?? null, json: r.body };
  });
  await t.test('stored document is the JSON list of notes', () => {
    assert.deepEqual(JSON.parse(store.data.get('notes')), [{ n: 1, text: 'hello' }, { n: 2, text: '世界 🌏' }]);
  });
  await t.test('no store answers 503, and a corrupt document 500', async () => {
    assert.deepEqual(await call(null, 'GET', '/notes'), { status: 503, body: { error: 'storage_unavailable' } });
    const corrupt = await call(memoryStore({ notes: 'not json' }), 'GET', '/notes');
    assert.deepEqual(corrupt, { status: 500, body: { error: 'store_corrupt' } });
  });
  await t.test('only the newest 50 notes are kept', async () => {
    const many = memoryStore();
    for (let i = 1; i <= 55; i++) await call(many, 'POST', '/notes', JSON.stringify({ text: `n${i}` }));
    const kept = JSON.parse(many.data.get('notes'));
    assert.equal(kept.length, 50);
    assert.deepEqual([kept[0], kept.at(-1)], [{ n: 6, text: 'n6' }, { n: 55, text: 'n55' }]);
  });
});

test('native notes: Almide reads and writes files under STORE_DIR, across restarts', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'almide-notes-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const port = await freePort();
  let server = await startServer('./build/server', [], port, { PORT: String(port), STORE_DIR: dir });
  await verifyNotes(t, httpCall(server.base));
  await server.stop();
  server = await startServer('./build/server', [], port, { PORT: String(port), STORE_DIR: dir });
  t.after(server.stop);
  await t.test('notes survive a restart', async () => {
    const r = await httpCall(server.base)('GET', '/notes', '');
    assert.deepEqual(r.json.notes.map(n => n.n), [2, 1]);
  });
});

test('native notes without storage answer 503', async t => {
  const port = await freePort();
  const server = await startServer('./build/server', [], port, { PORT: String(port), STORE_DIR: '', GCS_BUCKET: '' });
  t.after(server.stop);
  const r = await httpCall(server.base)('GET', '/notes', '');
  assert.deepEqual([r.status, r.json], [503, { error: 'storage_unavailable' }]);
});
