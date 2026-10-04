// Common Node host for the three function adapters. The compiler-generated JS
// owns the Wasm ABI; Almide's serve makes the storage calls through the hooks.
import { readFile } from 'node:fs/promises';
import { init, serve } from '../build/app.js';
import { storeHost } from './store.mjs';
import { gcsStore } from './gcs-store.mjs';

const host = storeHost();
let initialization;

// GCS_BUCKET selects Cloud Storage; without it, requests that need storage get 503.
const defaultStore = process.env.GCS_BUCKET ? gcsStore(process.env.GCS_BUCKET) : null;

export async function callApi(method, target, body = '', { store = defaultStore } = {}) {
  if (![method, target, body].every(value => typeof value === 'string')) {
    throw new TypeError('callApi expects method, target and body strings');
  }
  initialization ??= readFile(new URL('../build/app.wasm', import.meta.url))
    .then(bytes => init(bytes, host.hooks));
  await initialization;
  return host.serveWith(serve, store, method, target, body);
}
