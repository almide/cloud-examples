import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { init, handle } from '../build/app.js';
import { cases } from './cases.mjs';
import { freePort, startServer, verifyHttp } from './http-harness.mjs';

test('generated Wasm JS contract (compiled-module entry)', async t => {
  const module = await WebAssembly.compile(await readFile(new URL('../build/app.wasm', import.meta.url)));
  await init(module);
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
