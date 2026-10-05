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

## /notes and KV

`/notes` is stored in the KV binding `NOTES`. Almide reads and writes it itself:
`src/wasm.almd` calls the hooks `store_get` / `store_put`, and `worker.js` binds
them to `env.NOTES` ([adapters/store.mjs](../../adapters/store.mjs)). KV only
returns Promises, so the hooks' `@extern` carries `returns: promise`, and the generated
JS suspends the module through JSPI until each KV call settles (root README,
"Storage: Almide drives every route").

`wrangler.jsonc` names the binding without an `id`, so `wrangler deploy`
provisions a namespace called `almide-cloud-example-notes`, and `wrangler dev
--local` simulates one (the tests use `--persist-to` with a fresh directory).
**`wrangler delete` does not delete that namespace**; remove it separately:

```sh
npx wrangler kv namespace list
npx wrangler kv namespace delete --namespace-id <id>
```

On 2026-10-04 the scenario in `tests/notes.mjs` passed against the deployed
Worker, the namespace then held exactly the two saved notes
(`wrangler kv key get notes --remote`), and the Worker and namespace were deleted.
KV is eventually consistent across locations and has no conditional write, so
concurrent POSTs from different isolates can lose one. Secrets, D1, R2 and
outbound `fetch` remain outside the example.

## Optional: Terraform

[terraform/](terraform/) deploys the Wrangler bundle with the Cloudflare provider:
a KV namespace `<name>-notes`, the Worker (on workers.dev unless
`workers_dev = false`), a version with `worker.js` and only the Wasm module it
imports, the `NOTES` binding and the same compatibility date and flags, and a
deployment of that version. Unlike `wrangler delete`, `terraform destroy` also
removes the KV namespace.

```sh
npm run build && npm run check:workers          # writes build/worker-bundle
export CLOUDFLARE_API_TOKEN=...                 # Workers Scripts and Workers KV Storage: Edit
cd providers/cloudflare-workers/terraform
cp terraform.tfvars.example terraform.tfvars   # account_id
terraform init && terraform apply
terraform destroy
```

On 2026-10-04 this created 4 resources; the 18 cases and the `/notes` scenario
passed from the edge (29/29) and KV held the two saved notes. A second `plan`
showed no changes. After `destroy` the API reported the Worker gone at once,
while the URL kept answering 200 for a few seconds before 404.

## Official references

- [Workers WebAssembly](https://developers.cloudflare.com/workers/runtime-apis/webassembly/javascript/)
- [Wrangler bundling](https://developers.cloudflare.com/workers/wrangler/bundling/)
- [Module registry and import.meta.url](https://blog.cloudflare.com/workers-module-registry-nodejs/)
- [Wrangler 4.147.0](https://github.com/cloudflare/workers-sdk/releases/tag/wrangler%404.147.0)
