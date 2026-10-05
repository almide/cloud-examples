import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cases } from './cases.mjs';
import { handler as lambda } from '../providers/aws-lambda/handler.mjs';
import { handler as google } from '../providers/google-cloud-functions/handler.mjs';
import { handler as azure } from '../providers/azure-functions/handler.mjs';
import { registration as azureRegistration } from '../providers/azure-functions/registration.mjs';

const eventFor = c => {
  const [rawPath, rawQueryString = ''] = c.path.split('?');
  return { version: '2.0', rawPath, rawQueryString,
    requestContext: { http: { method: c.method } }, body: c.body ?? '', isBase64Encoded: false };
};

async function invokeGoogle(c, overrides = {}) {
  const result = { headers: {} };
  const res = {
    status(value) { result.status = value; return res; },
    set(name, value) { result.headers[name.toLowerCase()] = value; return res; },
    send(value) { result.body = value; return res; },
  };
  await google({ method: c.method, originalUrl: c.path, rawBody: Buffer.from(c.body ?? ''), ...overrides }, res);
  return result;
}

for (const [name, invoke] of [
  ['Lambda HTTP payload v2 adapter', async c => {
    const result = await lambda(eventFor(c));
    assert.equal(result.isBase64Encoded, false);
    return { ...result, status: result.statusCode };
  }],
  ['Cloud Run functions raw request adapter', invokeGoogle],
  ['Azure Functions HTTP adapter', c => azure(new Request(`http://localhost${c.path}`, {
    method: c.method, ...(c.method === 'GET' || c.method === 'HEAD' ? {} : { body: c.body ?? '' }),
  }))],
]) {
  test(name, async t => {
    for (const c of cases) await t.test(c.name, async () => {
      const result = await invoke(c);
      assert.equal(result.status, c.status);
      assert.deepEqual(JSON.parse(result.body), c.json);
      assert.match(result.headers['content-type'], /application\/json/);
      assert.equal(result.headers.allow, c.allow);
    });
  });
}

test('Lambda decodes base64 Unicode body', async () => {
  const body = JSON.stringify({ name: '世界 🌏' });
  const event = eventFor({ method: 'POST', path: '/greet', body });
  event.body = Buffer.from(body).toString('base64');
  event.isBase64Encoded = true;
  const result = await lambda(event);
  assert.deepEqual(JSON.parse(result.body), { message: 'Hello, 世界 🌏!' });
});

test('Lambda refuses unrelated event types instead of silently routing them', async () => {
  await assert.rejects(lambda({ Records: [] }), /HTTP payload v2/);
  await assert.rejects(lambda({ httpMethod: 'GET', path: '/health' }), /HTTP payload v2/);
});

test('Google preserves raw bytes even when parsed body differs', async () => {
  const result = await invokeGoogle({ method: 'POST', path: '/greet', body: '{"name":"raw"}' }, {
    body: { name: 'parsed replacement' },
  });
  assert.deepEqual(JSON.parse(result.body), { message: 'Hello, raw!' });
});

test('Google refuses parsed object without rawBody', async () => {
  await assert.rejects(invokeGoogle({ method: 'POST', path: '/greet' }, {
    rawBody: undefined, body: { name: 'lost raw bytes' },
  }), /rawBody is required/);
});

test('all adapters preserve status and Allow but omit HTTP HEAD response bodies', async () => {
  const c = { method: 'HEAD', path: '/health' };
  const a = await lambda(eventFor(c));
  const g = await invokeGoogle(c);
  const z = await azure(new Request('http://localhost/health', { method: 'HEAD' }));
  for (const result of [a, g, z]) {
    assert.equal(result.status ?? result.statusCode, 405);
    assert.equal(result.headers.allow, 'GET');
    assert.equal(result.body, '');
  }
});

test('Azure trigger explicitly accepts every SDK HTTP method before shared routing', async () => {
  assert.deepEqual(azureRegistration.methods, [
    'GET', 'POST', 'DELETE', 'HEAD', 'PATCH', 'PUT', 'OPTIONS', 'TRACE', 'CONNECT',
  ]);
  assert.equal(azureRegistration.authLevel, 'function');
  assert.equal(azureRegistration.route, '{*path}');
  assert.equal(azureRegistration.handler, azure);
  for (const method of azureRegistration.methods.filter(value => value !== 'GET')) {
    // Fetch Request forbids TRACE/CONNECT; Azure's supported-method union does
    // not. This minimal HttpRequest-shaped fixture tests the registration and
    // shared handler contract without claiming an Azure host/network test.
    const result = await azureRegistration.handler({
      method, url: 'https://example.invalid/health', text: async () => '',
    });
    assert.equal(result.status, 405, method);
    assert.equal(result.headers.allow, 'GET', method);
    if (method === 'HEAD') assert.equal(result.body, '');
    else assert.deepEqual(JSON.parse(result.body), { error: 'method_not_allowed' });
  }
});

test('warm and overlapping invocations remain isolated', async () => {
  const responses = await Promise.all(Array.from({ length: 100 }, (_, i) =>
    lambda(eventFor({ method: 'POST', path: '/greet', body: JSON.stringify({ name: String(i) }) }))));
  for (const [i, result] of responses.entries()) {
    assert.deepEqual(JSON.parse(result.body), { message: `Hello, ${i}!` });
  }
});

test('Node function host runs the notes scenario against an injected store', async t => {
  const { callApi } = await import('../adapters/node-wasm.mjs');
  const { memoryStore } = await import('../adapters/store.mjs');
  const store = memoryStore();
  const { verifyNotes } = await import('./notes.mjs');
  await verifyNotes(t, async (method, path, body) => {
    const r = await callApi(method, path, body, { store });
    return { status: r.status, allow: r.allow ?? null, json: r.body };
  });
});

test('function adapters without GCS_BUCKET answer /notes with 503', async () => {
  const c = { method: 'GET', path: '/notes' };
  const result = await lambda(eventFor(c));
  assert.equal(result.statusCode, 503);
  assert.deepEqual(JSON.parse(result.body), { error: 'storage_unavailable' });
});
