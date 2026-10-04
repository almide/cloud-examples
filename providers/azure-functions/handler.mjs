import { callApi } from '../../adapters/node-wasm.mjs';

export async function handler(request) {
  const url = new URL(request.url);
  const body = request.method === 'GET' || request.method === 'HEAD' ? '' : await request.text();
  const result = await callApi(request.method, url.pathname + url.search, body);
  return {
    status: result.status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(result.allow ? { allow: result.allow } : {}),
    },
    body: request.method === 'HEAD' ? '' : JSON.stringify(result.body),
  };
}
