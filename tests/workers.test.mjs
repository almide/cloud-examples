import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { freePort, startServer, verifyHttp } from './http-harness.mjs';
import { verifyNotes, httpCall } from './notes.mjs';

test('Workers local workerd contract', async t => {
  const port = await freePort();
  const inspectorPort = await freePort();
  // A fresh local KV state, so the notes scenario starts from an empty store.
  const state = await mkdtemp(join(tmpdir(), 'almide-wrangler-'));
  t.after(() => rm(state, { recursive: true, force: true }));
  const server = await startServer('./node_modules/.bin/wrangler', [
    'dev', '--local', '--ip', '127.0.0.1', '--port', String(port),
    '--config', 'providers/cloudflare-workers/wrangler.jsonc',
    '--inspector-port', String(inspectorPort), '--persist-to', state,
  ], port, { WRANGLER_SEND_METRICS: 'false', CI: '1' });
  t.after(server.stop);
  await verifyHttp(t, server.base);
  await verifyNotes(t, httpCall(server.base));
});
