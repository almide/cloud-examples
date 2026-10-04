// Actual local Functions Framework transport tests. Cloud IAM/ingress are not emulated.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cases } from './cases.mjs';
import { freePort, startServer } from './http-harness.mjs';

const frameworkRejected = new Set(['invalid JSON', 'body limit', 'known lenient trailing text']);

test('Google Functions Framework: JSON prevalidation is an explicit host boundary', async t => {
  const port = await freePort();
  const server = await startServer('./build/packages/google-cloud-functions/node_modules/.bin/functions-framework', [
    '--source', 'build/packages/google-cloud-functions', '--target', 'almideApi',
    '--signature-type', 'http', '--port', String(port),
  ], port, { NODE_ENV: 'production' });
  t.after(server.stop);
  for (const c of cases) await t.test(c.name, async () => {
    const response = await fetch(server.base + c.path, {
      method: c.method, headers: { 'content-type': 'application/json' },
      ...(c.method === 'POST' ? { body: c.body ?? '' } : {}),
    });
    if (frameworkRejected.has(c.name)) {
      // These fixtures are not syntactically valid JSON. The framework refuses
      // them before our adapter/Almide handler (including the malformed size case).
      assert.equal(response.status, 400);
      assert.match(response.headers.get('content-type'), /^text\/html/);
      await response.text();
    } else {
      assert.equal(response.status, c.status);
      assert.deepEqual(await response.json(), c.json);
      if (c.allow) assert.equal(response.headers.get('allow'), c.allow);
    }
  });
  await t.test('valid oversized JSON still reaches the shared 413 rule', async () => {
    const response = await fetch(server.base + '/greet', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Almide', padding: 'x'.repeat(8192) }),
    });
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: 'body_too_large' });
  });
});

test('Google Functions Framework: octet-stream preserves all 18 raw-body cases', async t => {
  const port = await freePort();
  const server = await startServer('./build/packages/google-cloud-functions/node_modules/.bin/functions-framework', [
    '--source', 'build/packages/google-cloud-functions', '--target', 'almideApi',
    '--signature-type', 'http', '--port', String(port),
  ], port, { NODE_ENV: 'production' });
  t.after(server.stop);
  for (const c of cases) await t.test(c.name, async () => {
    const response = await fetch(server.base + c.path, {
      method: c.method, headers: { 'content-type': 'application/octet-stream' },
      ...(c.method === 'POST' ? { body: c.body ?? '' } : {}),
    });
    assert.equal(response.status, c.status);
    assert.deepEqual(await response.json(), c.json);
    if (c.allow) assert.equal(response.headers.get('allow'), c.allow);
  });
});
