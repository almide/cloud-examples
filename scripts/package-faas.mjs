// Prepare source packages locally. This never installs dependencies or contacts a cloud.
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const providers = new Set(['aws-lambda', 'google-cloud-functions', 'azure-functions']);
const provider = process.argv[2];
if (!providers.has(provider)) {
  throw new Error('Usage: node scripts/package-faas.mjs aws-lambda|google-cloud-functions|azure-functions');
}
const root = fileURLToPath(new URL('..', import.meta.url));
const source = join(root, 'providers', provider);
const output = join(root, 'build/packages', provider);
const marker = '.almide-generated-package';
const metadata = JSON.stringify({ provider, source: 'almide-cloud-examples' }) + '\n';

// Check all required inputs before touching a previous generated package.
for (const path of [
  'adapters/node-wasm.mjs', 'adapters/step.mjs', 'adapters/gcs-store.mjs', 'build/app.js', 'build/app.wasm',
  `providers/${provider}/package.json`, `providers/${provider}/package-lock.json`,
]) await stat(join(root, path));

try {
  await stat(output);
  if (await readFile(join(output, marker), 'utf8') !== metadata) {
    throw new Error(`Refusing to replace an unrecognized directory: ${output}`);
  }
  await rm(output, { recursive: true });
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  // An existing directory with no marker must never be removed or adopted.
  try {
    await stat(output);
    throw new Error(`Refusing to replace an unmarked directory: ${output}`);
  } catch (missing) { if (missing.code !== 'ENOENT') throw missing; }
}
await mkdir(output, { recursive: true });
await writeFile(join(output, marker), metadata);

for (const path of ['adapters/node-wasm.mjs', 'adapters/step.mjs', 'adapters/gcs-store.mjs', 'build/app.js', 'build/app.wasm', 'licenses', 'LICENSE']) {
  const dest = join(output, path);
  await mkdir(resolve(dest, '..'), { recursive: true });
  await cp(join(root, path), dest, { recursive: true });
}
// Copy only reviewed JS entry modules. Never copy .env, local.settings.json,
// deployment parameter files, node_modules, local credentials, or build outputs.
for (const name of await readdir(source)) {
  if (!/^[a-zA-Z0-9_.-]+\.(mjs|js)$/.test(name)) continue;
  const dest = join(output, 'providers', provider, name);
  await mkdir(resolve(dest, '..'), { recursive: true });
  await cp(join(source, name), dest);
}
for (const name of ['package.json', 'package-lock.json']) {
  await cp(join(source, name), join(output, name));
}
if (provider === 'azure-functions') await cp(join(source, 'host.json'), join(output, 'host.json'));
console.log(`Prepared ${output}\nInstall dependencies there with npm ci --omit=dev; no deployment performed.`);
