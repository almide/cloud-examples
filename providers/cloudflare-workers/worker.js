import module from '../../build/app.wasm';
import { init, step } from '../../build/app.js';
import { runStep } from '../../adapters/step.mjs';

// One init per isolate. No filesystem/URL fallback and no handwritten Wasm ABI.
const ready = init(module);

// The NOTES KV namespace is the store; without the binding, /notes answers 503.
const kvStore = kv => kv && { get: key => kv.get(key), put: (key, value) => kv.put(key, value) };

export default {
  async fetch(request, env) {
    await ready;
    const url = new URL(request.url);
    const body = request.method === 'GET' || request.method === 'HEAD'
      ? '' : await request.text();
    const response = await runStep(step, request.method, url.pathname, body, kvStore(env.NOTES));
    return Response.json(response.body, {
      status: response.status,
      ...(response.allow ? { headers: { Allow: response.allow } } : {}),
    });
  },
};
