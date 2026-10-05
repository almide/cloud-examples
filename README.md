# cloud-examples

One small JSON API, one shared Almide implementation, three execution routes:

- **Native HTTP + Linux container**: ConoHa VPS, Google Cloud Run, Azure Container Apps, AWS ECS Fargate
- **Wasm + compiler-generated JavaScript host**: Cloudflare Workers
- **Wasm + Node function adapters**: AWS Lambda, Google Cloud Run functions, Azure Functions

The example proves portable application logic, including logic that reads and
writes storage: `/notes` keeps a small list in Workers KV, Cloud Storage or a
file, and the same Almide code decides every read and write on every route. It
is not a cloud SDK, production framework, or claim that all Almide I/O works on
every provider.

## Verified scope

The compiler is the official Almide
[`v0.66.0`](https://github.com/almide/almide/releases/tag/v0.66.0) release binary
(`almide 0.66.0 (release, 819bbc74f)`), pinned by [.almide-release](.almide-release)
and the archive checksums in [.almide-checksums.sha256](.almide-checksums.sha256).
Results checked on **2026-10-04**. Most rows below were first established with a
source build of the earlier pin, commit
[`852b028`](https://github.com/almide/almide/commit/852b028a5706801fd008a753bcbdf8b3ea93156f)
(`0.66.0 (dev)`); after the switch, every route in the table that was run before
(local suites, Docker/Compose on macOS arm64 and on the ConoHa VPS, Cloudflare
Workers, Google Cloud Run container and functions, GitHub Actions) was rerun with
the release binary and gave the same results.
See [verification notes](docs/verification.md#compiler-pin-moved-to-the-v0660-release).

| Route | Build / bundle | Shared API contract | Live cloud |
| --- | --- | --- | --- |
| Linux x86_64 native HTTP | Passed locally | 18 cases passed over HTTP | Not deployed |
| macOS arm64 native HTTP | Passed locally with the `--release` installer | 18 cases passed over HTTP | Not applicable |
| Wasm + generated JS, Node 24.19.0 | Passed locally | Same 18 cases + 1,000 repeated string calls | Not applicable |
| Workers, Wrangler 4.147.0 / local workerd | Dry-run bundle passed; real `wrangler deploy` uploaded | Same 18 cases passed over HTTP locally and on the workers.dev edge | Deployed temporarily with Wrangler and with [Terraform](providers/cloudflare-workers/terraform/), verified, deleted |
| ConoHa Docker / Compose | Image built and Compose started on macOS arm64 (Docker 29.6.1) and on a ConoHa VPS, x86_64 (Docker 29.2.1, Compose v5.0.2) | Same 18 cases passed against the container on both | VPS created with [Terraform](providers/conoha/terraform/), verified, destroyed |
| Google Cloud Run container | linux/amd64 image built (QEMU on Apple silicon), pushed by digest; `replace --dry-run` and deploy passed | Same 18 cases passed from a VM inside the VPC with an ID token | Deployed temporarily with internal ingress + IAM, by gcloud and by [Terraform](providers/google-cloud-run/terraform/), verified, deleted |
| Azure Container Apps / ECS Fargate | Provider templates and local safety/shape checks passed; image not built for them | Shared native contract passed; provider runtime not run | Not deployed |
| AWS Lambda, Node 24 | Source package generated; adapter/config tests passed | 18 common cases, base64/event/HEAD/warm-call checks; staged package executed locally | Not deployed |
| Google Cloud Run functions, Node 24 | Source package, local Functions Framework, and managed source build via `deploy.sh --execute` | 18 direct adapter cases; in the cloud, 18 octet-stream cases passed and JSON showed the same 3 framework rejections as locally | Deployed temporarily with internal ingress + IAM, by `deploy.sh` and by [Terraform](providers/google-cloud-functions/terraform/), verified, deleted |
| Azure Functions v4, Node 24 | Source package, adapter/config tests and actual SDK request objects tested | 18 common cases; Functions host/key enforcement not run | Not deployed |

The `/notes` storage scenario ([tests/notes.mjs](tests/notes.mjs), 10 requests in
order against an empty store) passed locally on every route (native files and a
restart, Wasm, Node adapters, local workerd KV, Compose with a named volume and a
container restart) and live on Cloudflare Workers with KV, on the Cloud Run
container with Almide reading and writing Cloud Storage itself, and on Cloud Run
functions with Cloud Storage; each store held exactly the two saved notes
afterwards. On the ConoHa VPS (x86_64, created with Terraform) the scenario passed,
the volume file held the two notes, and they survived a container restart.

GitHub Actions (`ubuntu-24.04`, compiler install and every reproduction step) has
passed. See [verification notes](docs/verification.md) for exact commands and limits.

## Quick start

Requires Linux (glibc 2.39+, e.g. Ubuntu 24.04 or Debian 13) or macOS, curl, Rust
**1.99.0**, a C build toolchain, Bash, and Node **22+**. Rust is still needed
because native `almide build` emits Rust and compiles it with cargo; the compiler
itself is downloaded. Local evidence used Linux x86_64 with Node **24.19.0**, and
macOS arm64 with Node **24.21.0** and **22.23.1**. Rust installation is a
prerequisite; the repository does not install it for you. `rust-toolchain.toml`
selects 1.99.0 only when `cargo` is the rustup proxy; a standalone `cargo` earlier
on `PATH` ignores it.

```sh
./scripts/install-almide.sh  # downloads the pinned release and checks its sha256 (seconds)
npm ci
npm run build
npm test
PORT=8080 ./build/server
```

From another terminal:

```sh
curl --fail http://127.0.0.1:8080/health
curl --fail http://127.0.0.1:8080/greet \
  -H 'content-type: application/json' --data '{"name":"Almide"}'
```

`GET /health` returns `{"ok":true}`. `POST /greet` returns
`{"message":"Hello, Almide!"}`. Native `http.serve` listens on all interfaces;
use the [ConoHa Compose example](providers/conoha/README.md) to publish only on
host loopback. The app has no authentication and should not be exposed as a
production service without additional review.

To exercise the Workers route locally:

```sh
npm run check:workers  # bundle dry-run, no upload
npm run test:workers   # local workerd, no cloud deployment
npm run dev:workers
```

## Provider guides

- [ConoHa VPS](providers/conoha/README.md): native container
- [Cloudflare Workers](providers/cloudflare-workers/README.md): Wasm in a Worker
- Google: [Cloud Run container](providers/google-cloud-run/README.md) · [Cloud Run functions](providers/google-cloud-functions/README.md)
- Azure: [Container Apps](providers/azure-container-apps/README.md) · [Functions](providers/azure-functions/README.md)
- AWS: [ECS Fargate](providers/aws-ecs-fargate/README.md) · [Lambda](providers/aws-lambda/README.md)

Container templates use existing infrastructure and private/internal ingress;
function examples retain IAM or function-key authentication. They do not create
accounts or silently grant caller access. Read [deployment safety and cleanup](docs/deployment-safety.md)
before applying any example. The Cloudflare Workers, Google Cloud Run container,
Cloud Run functions and ConoHa VPS examples have been deployed temporarily for
verification and then deleted; the AWS and Azure examples have not been deployed.
Each of these also has optional Terraform (ConoHa, Cloud Run, Cloud Run functions,
Workers), applied, verified and destroyed once; see each provider guide.

### Prepare and test function packages locally

These variants require **Node 24**. Build first, then:

```sh
npm run package:faas
npm ci --prefix build/packages/google-cloud-functions --omit=dev --ignore-scripts
npm ci --prefix build/packages/azure-functions --omit=dev --ignore-scripts
npm run test:google-framework
npm run test:staged-functions
```

Packages under `build/packages/` contain only allowlisted runtime inputs,
provider manifests/lockfiles, and license notices. They exclude local settings,
credentials and compiler sources. Packaging does not upload or deploy anything.
Repackaging replaces only a recognized generated package; do not edit staging
files or save credentials there.

Google's framework can reject invalid `application/json` before Almide runs.
That behavior is tested separately rather than disguised as identical HTTP
semantics. Lambda and Azure local adapter/SDK tests are not managed-runtime or
authentication emulators.

## What is shared

[src/api.almd](src/api.almd) owns path routing, input validation, response status,
JSON encoding, method errors and what to store. Its public boundary is strings in
and one JSON envelope out: `step(method, target, body, reads) -> String`
(`handle(method, target, body)` is the same without storage). Each host runs
`step` to the end with its own storage, in Almide.

- [src/native.almd](src/native.almd) maps Almide HTTP requests/responses, and performs storage itself
- [src/wasm.almd](src/wasm.almd) runs `step` with two storage hooks and exports `serve` (and `handle`) to generated JS
- [worker.js](providers/cloudflare-workers/worker.js) maps Workers Request/Response, with KV as the store
- [adapters/node-wasm.mjs](adapters/node-wasm.mjs) shares one lazy Wasm initializer across Node function adapters
- [adapters/store.mjs](adapters/store.mjs) binds the hooks to a store for the JS hosts; [adapters/gcs-store.mjs](adapters/gcs-store.mjs) is Cloud Storage for Node
- [tests/cases.mjs](tests/cases.mjs) and [tests/notes.mjs](tests/notes.mjs) are the shared expected-behavior fixtures

The HTTP response contains the envelope's `body`; `status` and optional `allow`
become HTTP metadata. The host adapters do not duplicate the application logic.

### Storage: Almide drives every route

`step` describes storage instead of doing it, so that each host can run it to the
end with its own store:

1. Call `step(method, target, body, "{}")`.
2. If the envelope has `"read": ["notes"]`, read those keys and call `step` again
   with `reads` = `{"notes": "<stored text>" | null}`.
3. The envelope with `"status"` is final. If it has `"write": {"key", "value"}`,
   store it before answering; a failed read or write answers 503
   `storage_unavailable`.

This loop is Almide code on every route. On native it calls `fs` or
`http.request` directly. On the JS hosts, Workers KV, `fetch` and Cloud Storage
only return Promises, so [src/wasm.almd](src/wasm.almd) declares two hooks,
`store_get(key)` and `store_put(key, value)`, as ordinary functions whose
`@extern` carries `returns: promise`. The generated JS then suspends
the module through JSPI (`WebAssembly.Suspending` / `promising`) until each hook
settles. Only `serve`, which reaches the hooks, returns a Promise; `handle` stays
synchronous. The JS side binds each hook to one store call
([adapters/store.mjs](adapters/store.mjs)) and does nothing else.

JSPI is on by default in workerd, Node 25+ and Node **24.20.0+**; Node 24.19.0 and
earlier lack it, and `init()` then refuses with a message saying so. A managed
"Node 24" runtime is not enough by itself: on 2026-10-04 Google's `nodejs24` image
was still 24.19.0, so Cloud Run functions was verified on `nodejs26` (beta, Node
26.7.0). Check the patch version of the Lambda and Azure Functions runtimes
before relying on `/notes` there.

`returns: promise` is not in the pinned v0.66.0 release. It ships in v0.67.0
([almide/almide#3353](https://github.com/almide/almide/issues/3353),
[#3371](https://github.com/almide/almide/issues/3371)). Until then, build Almide's
`develop` and point `ALMIDE_BIN` at it.

| Route | Store | Who calls it |
| --- | --- | --- |
| Native (ConoHa, Cloud Run container) | `STORE_DIR` files, or `GCS_BUCKET` objects | Almide: `fs`, or `http.request` with a metadata-server token |
| Cloudflare Workers | KV binding `NOTES` | Almide, through the `store_get` / `store_put` hooks bound to `env.NOTES` |
| Cloud Run functions | `GCS_BUCKET` objects | Almide, through the hooks bound to `adapters/gcs-store.mjs` (`fetch`, no SDK) |
| Lambda, Azure Functions | none configured | `/notes` answers 503 |

`/notes` keeps one JSON list under the key `notes`: `POST {"text": ...}` (1–280
code points) adds `{n, text}` and answers 201; `GET` lists the newest first. Only
the newest 50 are kept. A request is a read-modify-write of that one key: native
`http.serve` handles one request at a time, so one native process never
interleaves two, but concurrent instances (Workers isolates, Cloud Run instances,
several replicas) can lose a write. There is no locking, versioning or
conditional write; this is a demonstration of the boundary, not a database.

## Deliberately small contract

- `/health`: GET; `/greet`: POST; `/notes`: GET and POST; query strings are ignored
- `name` must be a string of 1–100 Unicode code points; it is not trimmed
- Request body limit in shared logic: 8,192 Unicode code points
- Application errors are JSON: 400, 404, 405 with `Allow`, and 413
- Almide's current JSON parser is **lenient**, including accepting trailing text.
  The test suite records that behavior explicitly; this example does not claim
  strict RFC JSON validation
- Native transport has its own limits: one request at a time, a 1 MiB wire-body
  ceiling and 30-second read/response limits. Rejections before the shared handler
  need not have the same JSON shape as application errors
- Host-specific request normalization, streaming, transport limits, HEAD behavior,
  concurrency/load, TLS, storage consistency, retries and Secrets are outside the
  portable contract. Provider authentication configuration is
  included, but cloud enforcement has not been verified

The JS host supports scalar/String boundaries, not arbitrary records and lists.
This is why the example uses JSON at the host boundary. It does not require a
custom WASI shim or a provider-specific compiler backend.

## Build discipline

The installer downloads the release archive for the current platform and refuses
to unpack or install it unless its sha256 matches the committed checksum.
Almide is pinned by release tag and archive checksum, Rust by exact version,
Wrangler by exact version and npm lockfile, and GitHub Actions by commit. Docker
base images use explicit version tags but are not digest-locked; this is not yet
a fully hermetic build. To move to another release, update `.almide-release` and
copy that release's `almide-checksums.sha256` lines into `.almide-checksums.sha256`.
`ALMIDE_BIN=/absolute/path/to/almide npm run build` is available for local compiler
development, but bypasses the default release check; record the compiler version
yourself when using it.

Generated Wasm/JS, executables, dependencies and local credentials are ignored.
Nothing in the default build/test workflow provisions cloud resources or deploys.

## License

This sample collection is available under the [MIT License](LICENSE).
Copyright (c) 2026 Aid-On Inc.

Almide and other third-party tools and dependencies retain their own licenses.
This repository's MIT license does not relicense the pinned Almide compiler,
its runtime, generated third-party code, or npm dependencies. See the
[upstream Almide license at the pinned release](https://github.com/almide/almide/blob/v0.66.0/LICENSE).
