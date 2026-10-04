import module from '../../build/app.wasm';
import { init, handle } from '../../build/app.js';

// One init per isolate. No filesystem/URL fallback and no handwritten Wasm ABI.
const ready = init(module);

export default {
  async fetch(request) {
    await ready;
    const url = new URL(request.url);
    const body = request.method === 'GET' || request.method === 'HEAD'
      ? '' : await request.text();
    const response = JSON.parse(handle(request.method, url.pathname, body));
    return Response.json(response.body, {
      status: response.status,
      ...(response.allow ? { headers: { Allow: response.allow } } : {}),
    });
  },
};
