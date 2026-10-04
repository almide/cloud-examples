// Execute the generated function-package layouts. No managed Lambda/Azure host,
// IAM, function key, trigger registration, networking or cloud API is emulated.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { cases } from './cases.mjs';
import { handler as lambda } from '../build/packages/aws-lambda/providers/aws-lambda/handler.mjs';
import { handler as azure } from '../build/packages/azure-functions/providers/azure-functions/handler.mjs';
const azureRequire = createRequire(new URL('../build/packages/azure-functions/package.json', import.meta.url));
const { HttpRequest } = azureRequire('@azure/functions');

test('staged Lambda package resolves shared Wasm and all contract cases', async t => {
  for (const c of cases) await t.test(c.name, async () => {
    const [rawPath, rawQueryString = ''] = c.path.split('?');
    const result = await lambda({ version: '2.0', rawPath, rawQueryString,
      requestContext: { http: { method: c.method } }, body: c.body ?? '', isBase64Encoded: false });
    assert.equal(result.statusCode, c.status);
    assert.deepEqual(JSON.parse(result.body), c.json);
  });
});

test('staged Azure package accepts real SDK HttpRequest objects', async t => {
  for (const c of cases) await t.test(c.name, async () => {
    const request = new HttpRequest({ method: c.method, url: `http://localhost${c.path}`,
      ...(c.method === 'POST' ? { body: { string: c.body ?? '' } } : {}) });
    const result = await azure(request);
    assert.equal(result.status, c.status);
    assert.deepEqual(JSON.parse(result.body), c.json);
  });
});
