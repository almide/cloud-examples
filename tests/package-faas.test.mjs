import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'almide-package-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const provider = 'aws-lambda';
  const files = {
    'adapters/node-wasm.mjs': '// adapter\n', 'adapters/store.mjs': '// store\n',
    'adapters/gcs-store.mjs': '// gcs\n', 'build/app.js': '// generated\n',
    'build/app.wasm': 'fixture bytes', 'LICENSE': 'fixture license',
    'licenses/Almide-MIT.txt': 'third-party notice',
    [`providers/${provider}/handler.mjs`]: 'export const handler = () => {};',
    [`providers/${provider}/package.json`]: '{"type":"module"}',
    [`providers/${provider}/package-lock.json`]: '{}',
    [`providers/${provider}/.env`]: 'DO_NOT_PACKAGE=test',
    [`providers/${provider}/local.settings.json`]: '{"key":"DO_NOT_PACKAGE"}',
    [`providers/${provider}/params.private.json`]: '{"key":"DO_NOT_PACKAGE"}',
    [`providers/${provider}/node_modules/private.txt`]: 'DO_NOT_PACKAGE',
  };
  for (const [path, content] of Object.entries(files)) {
    const dest = join(root, path);
    await mkdir(join(dest, '..'), { recursive: true });
    await writeFile(dest, content);
  }
  await mkdir(join(root, 'scripts'));
  await copyFile(new URL('../scripts/package-faas.mjs', import.meta.url), join(root, 'scripts/package-faas.mjs'));
  const run = name => spawnSync(process.execPath, ['scripts/package-faas.mjs', name], { cwd: root, encoding: 'utf8' });
  return { root, provider, output: join(root, 'build/packages', provider), run };
}

test('FaaS packaging copies reviewed inputs, notices and no local credentials', async t => {
  const f = await fixture(t);
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = f.run(f.provider);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(await readdir(join(f.output, 'providers', f.provider)), ['handler.mjs']);
    assert.equal(await readFile(join(f.output, 'licenses/Almide-MIT.txt'), 'utf8'), 'third-party notice');
    assert.equal(await readFile(join(f.output, 'build/app.wasm'), 'utf8'), 'fixture bytes');
    assert.equal(await readFile(join(f.output, 'package.json'), 'utf8'), '{"type":"module"}');
  }
});

test('FaaS packaging refuses unmarked output and preserves it', async t => {
  const f = await fixture(t);
  await mkdir(f.output, { recursive: true });
  await writeFile(join(f.output, 'user-file'), 'preserve');
  const result = f.run(f.provider);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unmarked directory/);
  assert.equal(await readFile(join(f.output, 'user-file'), 'utf8'), 'preserve');
});

test('FaaS packaging rejects unknown provider names', async t => {
  const f = await fixture(t);
  const result = f.run('../unexpected');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Usage:/);
});
