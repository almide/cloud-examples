# Cloudflare Workers: Wasm + generated JS route

The Worker imports a precompiled `.wasm` module, initializes Almide's generated
JS host once per isolate, and maps `Request`/`Response` to the same shared JSON
handler used by native. It does not run `http.serve` on Workers.

From the repository root, after building:

```sh
npm ci
npm run check:workers   # bundle only; does not deploy
npm run test:workers    # local workerd HTTP contract tests
npm run dev:workers    # interactive local development
```

Node >=22 is required; Wrangler is pinned to 4.147.0 with a lockfile. The
compatibility date is 2026-10-04. `new_module_registry` is explicit because the
compiler-generated JS evaluates `new URL(..., import.meta.url)` at module scope.
`nodejs_compat` is explicit for the generated, unused `node:fs/promises` fallback;
this fallback is not used to load Wasm. The wrapper passes the static
`WebAssembly.Module` directly to `init`.

No credentials, account IDs, API tokens or deployments are included.

On 2026-10-04 this configuration was deployed unchanged with
`npx wrangler deploy --config providers/cloudflare-workers/wrangler.jsonc`
to a `*.workers.dev` URL, passed the shared 18-case HTTP contract from the edge,
and was removed with `wrangler delete`. The deployed Worker has **no
authentication**: a workers.dev URL is public. Delete it when finished. Right
after a first deploy, the workers.dev route can briefly answer
`404 error code: 1042` until it propagates (about 2 seconds here). Production
quotas and behavior under real load were not tested. See the root support matrix
for the exact evidence.

Bindings, Secrets, outbound asynchronous `fetch`, D1, R2 and KV are intentionally
outside this first example. They would belong in host adapters. The generated JS
host's environment is not a transparent bridge to Workers bindings.

## Official references

- [Workers WebAssembly](https://developers.cloudflare.com/workers/runtime-apis/webassembly/javascript/)
- [Wrangler bundling](https://developers.cloudflare.com/workers/wrangler/bundling/)
- [Module registry and import.meta.url](https://blog.cloudflare.com/workers-module-registry-nodejs/)
- [Wrangler 4.147.0](https://github.com/cloudflare/workers-sdk/releases/tag/wrangler%404.147.0)
