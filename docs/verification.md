# Verification record

Date: 2026-10-04 (UTC)

## Toolchain and source

- Almide source: `852b028a5706801fd008a753bcbdf8b3ea93156f`
- Compiler built from that clean checkout with `cargo build --locked --profile ci-test --bin almide`
- Rust: `rustc 1.99.0 (b940084d7 2026-09-28)`
- Node: `v24.19.0`
- Wrangler: `4.147.0`; npm dependencies fixed in `package-lock.json`
- Function dependencies: Functions Framework `5.0.5` and Azure Functions SDK
  `4.16.5`, fixed in provider-specific lockfiles
- Platform: Linux x86_64

The local compiler used an unoptimized test profile to reduce bootstrap time;
the supplied installer and Dockerfile build the same source with `--release`.
Those complete bootstrap/Docker workflows were executed later; see the second
run and GitHub Actions sections below.
The native application was built with normal `almide build`.

## Passed

1. `npm run build`, using `ALMIDE_BIN` pointing to the compiler built above
2. `npm test`: 18 shared contract cases on native HTTP and generated Wasm JS;
   another test makes 1,000 Unicode String round trips through one Wasm instance;
   three installer regressions reject tracked/untracked changes without deleting
   edits and accept a clean checkout containing ignored build artifacts
3. `npm run check:workers`: bundle dry-run, no upload
4. `npm run test:workers`: 18 shared contract cases in Wrangler's local workerd
5. Three Node function adapters: the same 18 cases each, Lambda base64/event
   validation, raw-body preservation, HEAD shaping, and overlapping warm calls
6. `npm run package:faas`: all three staging packages generated; packaging tests
   exclude local credential/settings files and refuse an unmarked output directory
7. `npm run test:staged-functions`: 18 cases from the packaged Lambda module and
   18 with the real Azure SDK HttpRequest class. Neither starts the managed host
8. `npm run test:google-framework`: actual local Functions Framework HTTP tests:
   19 JSON cases plus 18 octet-stream cases, including expected host rejections
9. Local container/function configuration safety and shape assertions: private
   ingress/subnets, authenticated invocation settings, image digest requirements,
   architecture, probes, role boundaries, and manifest/lock consistency
10. Shell/JavaScript syntax, JSON parsing, documented command-block checks and
    Git whitespace checks

The shared tests cover health, query stripping, success, Unicode, JSON escaping,
malformed JSON, empty body, missing/wrong-type name, non-object input, name
length boundaries, shared body limit, method rejection with Allow, unknown path,
and the known lenient trailing-text parser behavior.

Installer regression tests use real local Git status/checkout and stub network fetch
and Cargo compilation; they are not a claim that the full release bootstrap ran.

The runtime uses generated glue unchanged. A top-level `import.meta.url` in that
glue requires Workers `new_module_registry`; the config records it. The unused
Node filesystem fallback remains in the bundle, so `nodejs_compat` is explicit.
The Wasm source is passed as a statically imported `WebAssembly.Module`.

## Function transport boundary

Google Functions Framework validates `application/json` before calling the
adapter. In three common fixtures (invalid JSON, the malformed oversized-body
fixture, and trailing text) the framework returned HTTP 400 HTML rather than the
shared handler's result. The local HTTP suite deliberately asserts that behavior.
A syntactically valid oversized JSON request still reaches the shared 413 rule.
With `application/octet-stream`, all 18 raw-body fixtures reach Almide unchanged.

Lambda tests use payload-v2 events and Azure tests use request objects; they
verify packaging and handler logic, not cloud IAM, keys or host routing. Azure
registration explicitly lists HTTP methods so the SDK's GET/POST-only default
cannot silently narrow the shared router. The real Functions host was not run.

Container template fields were checked against current official provider
references linked in each README. Local safety/shape tests are not a substitute
for provider-side schema validation, image execution or deployment tests.

## Environment-specific adjustments

The test environment had no writable conventional home directory. npm cache and
Wrangler's home/config/log paths were pointed to a writable temporary directory
through environment variables. No user credentials were supplied.

Wrangler's default inspector-port discovery attempted unsupported network-interface
enumeration in this environment. The test selects an explicit free inspector
port with the documented `--inspector-port` flag. No tool or runtime was patched.

## Second run: macOS arm64 and Docker

Date: 2026-10-04. Same Almide pin and repository revision.

- Platform: macOS (Darwin 25.3.0) arm64; Docker 29.6.1 with linux/arm64 images
- Rust `1.99.0` through rustup; Node `v24.21.0` (npm 11.19.0) and `v22.23.1`
- Compiler built with the supplied `./scripts/install-almide.sh` (`--release`,
  about 7.5 minutes), not `ALMIDE_BIN`

Passed:

1. Every command in [Reproduction](#reproduction), unmodified, on Node 24.21.0:
   `npm test` 116/116, `test:workers` 19/19, `test:google-framework` 39/39,
   `test:staged-functions` 38/38, `check:workers` dry-run bundle 28.50 KiB
2. `npm test` on Node 22.23.1: 116/116
3. `docker build .` with the supplied Dockerfile (runtime image 165 MB)
4. The ConoHa README Compose commands: `/health` and `/greet` returned the
   documented bodies. The same 18 shared cases (`verifyHttp` from
   `tests/http-harness.mjs`) passed against the container on loopback
5. The running container used UID/GID 65532, a read-only root filesystem and
   `CapDrop=[ALL]`. `docker compose down` finished in under 1 second, so the
   server exits on SIGTERM without waiting for the kill timeout

Observations:

- A standalone `cargo` (1.96.1) ahead of rustup on `PATH` ignored
  `rust-toolchain.toml`; `~/.cargo/bin` had to come first
- npm 11 install-script approval skipped `workerd`'s postinstall. The platform
  binary still arrived through its optional dependency and Workers tests passed
- `npm audit --omit=dev` in the staged Google package reports 3 moderate
  advisories (`uuid` via `cloudevents` via `@google-cloud/functions-framework`).
  The only offered fix is a breaking downgrade, so it was not applied

## GitHub Actions

The supplied workflow passed on `ubuntu-24.04` for commits `395df39` and
`899f90b` (push and pull_request events): `install-almide.sh` with `--release`
followed by every command in [Reproduction](#reproduction).

## Cloudflare Workers edge deployment

Date: 2026-10-04. Wrangler 4.147.0, unchanged `wrangler.jsonc`.

1. `npx wrangler deploy --config providers/cloudflare-workers/wrangler.jsonc`
   uploaded 28.50 KiB (gzip 11.39 KiB); reported Worker startup time 19 ms
2. The same 18 shared cases (`verifyHttp`) passed against the workers.dev URL,
   served from the KIX colo, on two separate deployments
3. A redeploy observed with `wrangler tail`: 10 immediate requests, all `ok`,
   no exceptions
4. After deleting and redeploying, workers.dev answered `404 error code: 1042`
   for about 2 seconds before the route propagated
5. `wrangler delete` removed the Worker; the URL then returned 404

The first request after the very first deployment returned HTTP 500. Its body was
not captured, and it did not recur on a redeploy (with tail) or on a fresh
deploy, so it is recorded as unexplained rather than attributed to Almide or to
propagation.

## Not established

- x86_64 Docker image build/run or Compose startup
- A ConoHa VPS installation, ingress, TLS, restart behavior or production load
- Cloud Run, Azure Container Apps or ECS Fargate provider validation/deployment
- Lambda managed runtime or Azure Functions host execution/authentication
- Google managed function source build, IAM enforcement or internal ingress
- Cloudflare production limits, load behavior, or the one unexplained first-request 500
- Any cloud storage, Secrets, authentication enforcement or async outbound HTTP portability
- Windows behavior, Linux arm64 native (outside Docker) and macOS x86_64

The support matrix intentionally separates these from local evidence.

## Reproduction

```sh
./scripts/install-almide.sh
npm ci
npm run build
npm test
npm run check:workers
npm run test:workers
npm run package:faas
npm ci --prefix build/packages/google-cloud-functions --omit=dev --ignore-scripts
npm ci --prefix build/packages/azure-functions --omit=dev --ignore-scripts
npm run test:google-framework
npm run test:staged-functions
```

For a future Docker gate, run the Compose commands in the ConoHa README on a
machine with Docker and verify `/health` and `/greet` before marking the route
container-tested. Deployments require a separate, explicit decision.

## Upstream references

- [HTTP server semantics at the pin](https://github.com/almide/almide/blob/852b028a5706801fd008a753bcbdf8b3ea93156f/docs/stdlib/http.md)
- [Generated JS host at the pin](https://github.com/almide/almide/blob/852b028a5706801fd008a753bcbdf8b3ea93156f/src/cli/js_host.rs)
- [JS host contract at the pin](https://github.com/almide/almide/blob/852b028a5706801fd008a753bcbdf8b3ea93156f/docs/wasm/WASM-OUTPUT.md)
