import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';
import { cases } from './cases.mjs';

export async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  return port;
}

export async function startServer(command, args, port, env = {}) {
  const process = spawn(command, args, { env: { ...globalThis.process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  let launchError;
  process.on('error', e => { launchError = e; });
  process.stdout.on('data', b => { output += b; });
  process.stderr.on('data', b => { output += b; });
  const stop = async () => {
    if (process.exitCode !== null || process.signalCode !== null) return;
    process.kill('SIGTERM');
    await Promise.race([once(process, 'exit').catch(() => {}), sleep(5000, undefined, { ref: false })]);
    if (process.exitCode === null && process.signalCode === null) process.kill('SIGKILL');
  };
  const base = `http://127.0.0.1:${port}`;
  try {
    for (let i = 0; i < 200; i++) {
      if (launchError) throw launchError;
      if (process.exitCode !== null) throw new Error(`Server exited: ${output}`);
      try {
        const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(1000) });
        if (response.status === 200) return { base, stop };
      } catch {}
      await sleep(100);
    }
    throw new Error(`Server did not become ready: ${output}`);
  } catch (e) { await stop(); throw e; }
}

export async function verifyHttp(t, base) {
  for (const c of cases) {
    await t.test(c.name, async () => {
      const response = await fetch(base + c.path, {
        method: c.method,
        headers: { 'content-type': 'application/json' },
        ...(c.method === 'POST' ? { body: c.body ?? '' } : {}),
        signal: AbortSignal.timeout(5000),
      });
      assert.equal(response.status, c.status);
      if (c.allow) assert.equal(response.headers.get('allow'), c.allow);
      assert.match(response.headers.get('content-type'), /^application\/json\b/);
      assert.deepEqual(await response.json(), c.json);
    });
  }
}
