import { callApi } from '../../adapters/node-wasm.mjs';

// Kept separate from Functions Framework registration for direct contract tests.
export async function handler(req, res) {
  const method = req.method;
  const target = req.originalUrl || req.url || '/';
  let body = '';
  if (method !== 'GET' && method !== 'HEAD') {
    // The framework owns its input stream. Never JSON.stringify(req.body): that
    // would change raw payload semantics. It may reject malformed JSON first.
    if (req.rawBody != null) body = Buffer.from(req.rawBody).toString('utf8');
    else if (typeof req.body === 'string') body = req.body;
    else if (req.body != null) throw new TypeError('Functions Framework rawBody is required');
  }
  const result = await callApi(method, target, body);
  res.status(result.status);
  res.set('content-type', 'application/json; charset=utf-8');
  if (result.allow) res.set('allow', result.allow);
  res.send(method === 'HEAD' ? '' : JSON.stringify(result.body));
}
