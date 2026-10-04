import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Real git status/checkout, but no network or compiler build. Only those two
// expensive operations are replaced, so the provenance guard is tested directly.
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'almide-installer-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, '.tools/almide-source');
  const bin = join(root, 'test-bin');
  await mkdir(source, { recursive: true });
  await mkdir(bin);
  await mkdir(join(root, 'scripts'));
  await copyFile(new URL('../scripts/install-almide.sh', import.meta.url), join(root, 'scripts/install-almide.sh'));
  const runGit = (...args) => {
    const result = spawnSync('git', ['-C', source, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  runGit('init', '-q');
  runGit('config', 'user.name', 'Installer Test');
  runGit('config', 'user.email', 'installer-test@example.invalid');
  runGit('config', 'commit.gpgsign', 'false');
  runGit('remote', 'add', 'origin', 'https://github.com/almide/almide.git');
  await writeFile(join(source, '.gitignore'), 'target/\n');
  await writeFile(join(source, 'compiler.rs'), '// unchanged\n');
  runGit('add', '.');
  runGit('commit', '-qm', 'fixture');
  const revision = runGit('rev-parse', 'HEAD');
  await writeFile(join(root, '.almide-revision'), revision + '\n');
  const realGit = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
  await writeFile(join(bin, 'git'), `#!/bin/sh\nif [ "$3" = fetch ]; then exit 0; fi\nexec "${realGit}" "$@"\n`, { mode: 0o755 });
  await writeFile(join(bin, 'cargo'), `#!/bin/sh\nset -eu\necho called > "$TEST_ROOT/cargo-called"\nmkdir -p "$TEST_ROOT/.tools/almide-source/target/release"\nprintf '#!/bin/sh\\necho fake-test-compiler\\n' > "$TEST_ROOT/.tools/almide-source/target/release/almide"\nchmod +x "$TEST_ROOT/.tools/almide-source/target/release/almide"\n`, { mode: 0o755 });
  const run = () => spawnSync('bash', ['scripts/install-almide.sh'], {
    cwd: root, encoding: 'utf8',
    env: { ...process.env, PATH: bin + ':' + process.env.PATH, TEST_ROOT: root },
  });
  return { root, source, revision, run };
}

for (const kind of ['tracked modification', 'untracked file']) {
  test(`installer refuses ${kind} without deleting it`, async t => {
    const f = await fixture(t);
    const edited = join(f.source, kind === 'tracked modification' ? 'compiler.rs' : 'new-file.rs');
    await writeFile(edited, '// preserve this edit\n');
    const result = f.run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /modified or untracked/);
    assert.equal(await readFile(edited, 'utf8'), '// preserve this edit\n');
    await assert.rejects(readFile(join(f.root, 'cargo-called')), { code: 'ENOENT' });
    await assert.rejects(readFile(join(f.root, '.tools/bin/almide.revision')), { code: 'ENOENT' });
  });
}

test('installer accepts a clean checkout with ignored build artifacts', async t => {
  const f = await fixture(t);
  await mkdir(join(f.source, 'target'));
  await writeFile(join(f.source, 'target/existing-build'), 'keep\n');
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(join(f.root, '.tools/bin/almide.revision'), 'utf8'), f.revision + '\n');
  assert.equal(await readFile(join(f.source, 'target/existing-build'), 'utf8'), 'keep\n');
});
