import { test } from 'node:test';
import { freePort, startServer, verifyHttp } from './http-harness.mjs';

test('Workers local workerd contract', async t => {
  const port = await freePort();
  const inspectorPort = await freePort();
  const server = await startServer('./node_modules/.bin/wrangler', [
    'dev', '--local', '--ip', '127.0.0.1', '--port', String(port),
    '--config', 'providers/cloudflare-workers/wrangler.jsonc',
    '--inspector-port', String(inspectorPort),
  ], port, { WRANGLER_SEND_METRICS: 'false', CI: '1' });
  t.after(server.stop);
  await verifyHttp(t, server.base);
});
