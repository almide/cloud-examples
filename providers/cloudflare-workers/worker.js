import module from '../../build/app.wasm';
import { init, serve } from '../../build/app.js';
import { storeHost } from '../../adapters/store.mjs';

// One init per isolate. No filesystem/URL fallback and no handwritten Wasm ABI.
const host = storeHost();
const ready = init(module, host.hooks);

// The NOTES KV namespace is the store; without the binding, /notes answers 503.
const kvStore = kv => kv && { get: key => kv.get(key), put: (key, value) => kv.put(key, value) };

export default {
  async fetch(request, env) {
    await ready;
    const url = new URL(request.url);
    const body = request.method === 'GET' || request.method === 'HEAD'
      ? '' : await request.text();
    const response = await host.serveWith(serve, kvStore(env.NOTES), request.method, url.pathname, body);
    return Response.json(response.body, {
      status: response.status,
      ...(response.allow ? { headers: { Allow: response.allow } } : {}),
    });
  },
};
