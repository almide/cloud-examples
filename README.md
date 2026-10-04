# cloud-examples

One small JSON API, one shared Almide implementation, three execution routes:

- **Native HTTP + Linux container**: ConoHa VPS, Google Cloud Run, Azure Container Apps, AWS ECS Fargate
- **Wasm + compiler-generated JavaScript host**: Cloudflare Workers
- **Wasm + Node function adapters**: AWS Lambda, Google Cloud Run functions, Azure Functions

The first example proves portable application logic. It is not a cloud SDK,
production framework, storage abstraction, or claim that all Almide I/O works on
every provider.

## Verified scope

Checked on **2026-10-04** against Almide commit
[`852b028a5706801fd008a753bcbdf8b3ea93156f`](https://github.com/almide/almide/commit/852b028a5706801fd008a753bcbdf8b3ea93156f)
(compiler reports `0.66.0 (dev)`). The exact source revision is in
[.almide-revision](.almide-revision). A released `0.66.0` binary is not assumed to
be the same compiler.

| Route | Build / bundle | Shared API contract | Live cloud |
| --- | --- | --- | --- |
| Linux x86_64 native HTTP | Passed locally | 18 cases passed over HTTP | Not deployed |
| macOS arm64 native HTTP | Passed locally with the `--release` installer | 18 cases passed over HTTP | Not applicable |
| Wasm + generated JS, Node 24.19.0 | Passed locally | Same 18 cases + 1,000 repeated string calls | Not applicable |
| Workers, Wrangler 4.147.0 / local workerd | Dry-run bundle passed | Same 18 cases passed over HTTP | Not deployed |
| ConoHa Docker / Compose | Image built and Compose started on Docker 29.6.1, linux/arm64 only | Same 18 cases passed against the container | Not deployed |
| Cloud Run / Azure Container Apps / ECS Fargate | Provider templates and local safety/shape checks passed; image not built | Shared native contract passed; provider runtime not run | Not deployed |
| AWS Lambda, Node 24 | Source package generated; adapter/config tests passed | 18 common cases, base64/event/HEAD/warm-call checks; staged package executed locally | Not deployed |
| Google Cloud Run functions, Node 24 | Source package and actual local Functions Framework tested | 18 direct adapter cases; HTTP tests explicitly cover framework JSON-prevalidation differences | Not deployed |
| Azure Functions v4, Node 24 | Source package, adapter/config tests and actual SDK request objects tested | 18 common cases; Functions host/key enforcement not run | Not deployed |

GitHub Actions is supplied but has not run for this new repository yet. See
[verification notes](docs/verification.md) for exact commands and limits.

## Quick start

Requires Linux or macOS, Git, Rust **1.99.0**, a C build toolchain, Bash, and Node
**22+**. Local evidence used Linux x86_64 with Node **24.19.0**, and macOS arm64
with Node **24.21.0** and **22.23.1**. Rust installation is a prerequisite; the
repository does not install it for you. `rust-toolchain.toml` selects 1.99.0 only
when `cargo` is the rustup proxy; a standalone `cargo` earlier on `PATH` ignores it.

```sh
./scripts/install-almide.sh  # builds the exact compiler commit; first build is substantial
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
before applying any example. No cloud command has been executed.

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
JSON encoding, and method errors. Its public boundary is three strings in and
one JSON envelope out: `handle(method, target, body) -> String`.

- [src/native.almd](src/native.almd) maps Almide HTTP requests/responses
- [src/wasm.almd](src/wasm.almd) exposes the same handler to generated JS
- [worker.js](providers/cloudflare-workers/worker.js) maps Workers Request/Response
- [adapters/node-wasm.mjs](adapters/node-wasm.mjs) shares one lazy Wasm initializer across Node function adapters
- [tests/cases.mjs](tests/cases.mjs) is the shared expected-behavior fixture

The HTTP response contains the envelope's `body`; `status` and optional `allow`
become HTTP metadata. The host adapters do not duplicate the greeting logic.

## Deliberately small contract

- `/health`: GET; `/greet`: POST; query strings are ignored
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
  concurrency/load, TLS, storage, retries, Secrets and outbound async I/O are
  outside the portable contract. Provider authentication configuration is
  included, but cloud enforcement has not been verified

The JS host supports scalar/String boundaries, not arbitrary records and lists.
This is why the example uses JSON at the host boundary. It does not require a
custom WASI shim or a provider-specific compiler backend.

## Build discipline

The installer refuses modified or untracked compiler source without deleting edits.
Almide is pinned by full commit, Rust by exact version, Wrangler by exact version
and npm lockfile, and GitHub Actions by commit. Docker base images use explicit
version tags but are not digest-locked; this is not yet a fully hermetic build.
`ALMIDE_BIN=/absolute/path/to/almide npm run build` is available for local compiler
development, but bypasses the default revision-file check; record the source
revision yourself when using it.

Generated Wasm/JS, executables, dependencies and local credentials are ignored.
Nothing in the default build/test workflow provisions cloud resources or deploys.

## License

This sample collection is available under the [MIT License](LICENSE).
Copyright (c) 2026 Aid-On Inc.

Almide and other third-party tools and dependencies retain their own licenses.
This repository's MIT license does not relicense the pinned Almide compiler,
its runtime, generated third-party code, or npm dependencies. See the
[upstream Almide license at the pinned revision](https://github.com/almide/almide/blob/852b028a5706801fd008a753bcbdf8b3ea93156f/LICENSE).
