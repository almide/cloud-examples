// The same application contract runs through native HTTP, generated Wasm JS,
// and Wrangler's local Workers runtime. Expected output is never provider-specific.
export const cases = [
  { name: 'health', method: 'GET', path: '/health', status: 200, json: { ok: true } },
  { name: 'health query', method: 'GET', path: '/health?probe=1', status: 200, json: { ok: true } },
  { name: 'greeting', method: 'POST', path: '/greet', body: '{"name":"Almide"}', status: 200, json: { message: 'Hello, Almide!' } },
  { name: 'Unicode', method: 'POST', path: '/greet', body: JSON.stringify({ name: '世界 🌏' }), status: 200, json: { message: 'Hello, 世界 🌏!' } },
  { name: 'JSON escaping', method: 'POST', path: '/greet', body: JSON.stringify({ name: 'a"b\\c\n' }), status: 200, json: { message: 'Hello, a"b\\c\n!' } },
  { name: 'invalid JSON', method: 'POST', path: '/greet', body: '{', status: 400, json: { error: 'invalid_json' } },
  { name: 'empty body', method: 'POST', path: '/greet', body: '', status: 400, json: { error: 'invalid_json' } },
  { name: 'missing name', method: 'POST', path: '/greet', body: '{}', status: 400, json: { error: 'name_required' } },
  { name: 'wrong name type', method: 'POST', path: '/greet', body: '{"name":4}', status: 400, json: { error: 'name_required' } },
  { name: 'non-object', method: 'POST', path: '/greet', body: '[]', status: 400, json: { error: 'name_required' } },
  { name: 'empty name', method: 'POST', path: '/greet', body: '{"name":""}', status: 400, json: { error: 'name_length' } },
  { name: '100 code points', method: 'POST', path: '/greet', body: JSON.stringify({ name: '🌏'.repeat(100) }), status: 200, json: { message: `Hello, ${'🌏'.repeat(100)}!` } },
  { name: '101 code points', method: 'POST', path: '/greet', body: JSON.stringify({ name: '🌏'.repeat(101) }), status: 400, json: { error: 'name_length' } },
  { name: 'body limit', method: 'POST', path: '/greet', body: 'x'.repeat(8193), status: 413, json: { error: 'body_too_large' } },
  { name: 'wrong health method', allow: 'GET', method: 'POST', path: '/health', status: 405, json: { error: 'method_not_allowed' } },
  { name: 'wrong greeting method', allow: 'POST', method: 'GET', path: '/greet', status: 405, json: { error: 'method_not_allowed' } },
  { name: 'unknown path', method: 'GET', path: '/missing', status: 404, json: { error: 'not_found' } },
  // Explicit upstream behavior, not a promise of strict RFC JSON parsing.
  { name: 'known lenient trailing text', method: 'POST', path: '/greet', body: '{"name":"Almide"} trailing', status: 200, json: { message: 'Hello, Almide!' } },
];
