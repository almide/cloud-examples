// Common Node host for the three function adapters. The compiler-generated JS
// owns the Wasm ABI; every request uses the same synchronous Almide function.
import { readFile } from 'node:fs/promises';
import { init, handle } from '../build/app.js';

let initialization;

export async function callApi(method, target, body = '') {
  if (![method, target, body].every(value => typeof value === 'string')) {
    throw new TypeError('callApi expects method, target and body strings');
  }
  initialization ??= readFile(new URL('../build/app.wasm', import.meta.url))
    .then(bytes => init(bytes));
  await initialization;
  return JSON.parse(handle(method, target, body));
}
