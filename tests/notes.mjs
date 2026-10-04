// The /notes scenario: the same requests, in order, against one empty store.
// `call(method, path, body)` returns { status, json, allow } for any route.
import assert from 'node:assert/strict';

export const notesScenario = [
  { name: 'empty list', method: 'GET', path: '/notes', status: 200, json: { notes: [] } },
  { name: 'first note', method: 'POST', path: '/notes', body: '{"text":"hello"}', status: 201, json: { note: { n: 1, text: 'hello' } } },
  { name: 'Unicode note', method: 'POST', path: '/notes', body: JSON.stringify({ text: '世界 🌏' }), status: 201, json: { note: { n: 2, text: '世界 🌏' } } },
  { name: 'newest first', method: 'GET', path: '/notes?x=1', status: 200, json: { notes: [{ n: 2, text: '世界 🌏' }, { n: 1, text: 'hello' }] } },
  { name: 'invalid JSON', method: 'POST', path: '/notes', body: '{', status: 400, json: { error: 'invalid_json' } },
  { name: 'missing text', method: 'POST', path: '/notes', body: '{}', status: 400, json: { error: 'text_required' } },
  { name: 'empty text', method: 'POST', path: '/notes', body: '{"text":""}', status: 400, json: { error: 'text_length' } },
  { name: '281 code points', method: 'POST', path: '/notes', body: JSON.stringify({ text: '🌏'.repeat(281) }), status: 400, json: { error: 'text_length' } },
  { name: 'wrong method', method: 'DELETE', path: '/notes', status: 405, allow: 'GET, POST', json: { error: 'method_not_allowed' } },
  { name: 'rejected writes stored nothing', method: 'GET', path: '/notes', status: 200, json: { notes: [{ n: 2, text: '世界 🌏' }, { n: 1, text: 'hello' }] } },
];

export async function verifyNotes(t, call) {
  for (const c of notesScenario) {
    await t.test(`notes: ${c.name}`, async () => {
      const result = await call(c.method, c.path, c.body ?? '');
      assert.equal(result.status, c.status);
      if (c.allow) assert.equal(result.allow, c.allow);
      assert.deepEqual(result.json, c.json);
    });
  }
}

// HTTP form of `call`, for servers, local runtimes and deployed services.
export const httpCall = (base, { headers = {} } = {}) => async (method, path, body) => {
  const response = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(method === 'GET' || method === 'HEAD' ? {} : { body }),
    signal: AbortSignal.timeout(10000),
  });
  return { status: response.status, allow: response.headers.get('allow'), json: await response.json() };
};
