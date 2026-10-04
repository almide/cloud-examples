import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Real checksum, tar and install steps; only the download is replaced by a stub
// curl that serves a locally built archive, so the integrity guard is tested directly.
function platform() {
  const os = spawnSync('uname', ['-s'], { encoding: 'utf8' }).stdout.trim();
  const arch = spawnSync('uname', ['-m'], { encoding: 'utf8' }).stdout.trim();
  return { 'Linux-x86_64': 'linux-x86_64', 'Linux-aarch64': 'linux-aarch64', 'Linux-arm64': 'linux-aarch64',
    'Darwin-arm64': 'macos-aarch64', 'Darwin-x86_64': 'macos-x86_64' }[`${os}-${arch}`];
}

async function fixture(t, { tag = 'v9.9.9', tamper = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'almide-installer-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const name = `almide-${platform()}`;
  const staging = join(root, 'staging', name);
  const bin = join(root, 'test-bin');
  await mkdir(staging, { recursive: true });
  await mkdir(bin);
  await mkdir(join(root, 'scripts'));
  await copyFile(new URL('../scripts/install-almide.sh', import.meta.url), join(root, 'scripts/install-almide.sh'));
  for (const tool of ['almide', 'almide-verify']) {
    await writeFile(join(staging, tool), `#!/bin/sh\necho fake-${tool}\n`, { mode: 0o755 });
  }
  const archive = join(root, `${name}.tar.gz`);
  const tar = spawnSync('tar', ['-czf', archive, '-C', join(root, 'staging'), name], { encoding: 'utf8' });
  assert.equal(tar.status, 0, tar.stderr);
  const digest = createHash('sha256').update(await readFile(archive)).digest('hex');
  const listed = tamper ? digest.replace(/^./, c => (c === '0' ? '1' : '0')) : digest;
  await writeFile(join(root, '.almide-release'), `${tag}\n`);
  await writeFile(join(root, '.almide-checksums.sha256'), `${listed}  ${name}.tar.gz\n`);
  // Stub curl: record the URL and copy the fixture archive to the -o target.
  await writeFile(join(bin, 'curl'), `#!/bin/sh\nset -eu\nout=\nwhile [ $# -gt 0 ]; do case "$1" in -o) out=$2; shift 2;; -*) shift;; *) echo "$1" > "$TEST_ROOT/curl-url"; shift;; esac; done\ncp "$TEST_ROOT/${name}.tar.gz" "$out"\n`, { mode: 0o755 });
  const run = () => spawnSync('bash', ['scripts/install-almide.sh'], {
    cwd: root, encoding: 'utf8',
    env: { ...process.env, PATH: bin + ':' + process.env.PATH, TEST_ROOT: root },
  });
  return { root, name, tag, run };
}

test('installer installs both tools from a release archive whose checksum matches', async t => {
  const f = await fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /fake-almide/);
  assert.equal(await readFile(join(f.root, '.tools/bin/almide.release'), 'utf8'), `${f.tag}\n`);
  await access(join(f.root, '.tools/bin/almide-verify'));
  assert.equal((await readFile(join(f.root, 'curl-url'), 'utf8')).trim(),
    `https://github.com/almide/almide/releases/download/${f.tag}/${f.name}.tar.gz`);
});

test('installer refuses an archive with the wrong checksum and installs nothing', async t => {
  const f = await fixture(t, { tamper: true });
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Checksum mismatch/);
  await assert.rejects(access(join(f.root, '.tools/bin')), { code: 'ENOENT' });
});

test('installer refuses a malformed release tag before downloading', async t => {
  const f = await fixture(t, { tag: 'main' });
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Invalid release tag/);
  await assert.rejects(access(join(f.root, 'curl-url')), { code: 'ENOENT' });
});
