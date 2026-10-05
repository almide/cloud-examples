# Verification record

Date: 2026-10-04 (UTC)

The compiler pin is now the official `v0.66.0` release binary; see
[Compiler pin moved to the v0.66.0 release](#compiler-pin-moved-to-the-v0660-release).
The sections before it record runs made with a source build of the earlier pin.

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

## Google Cloud deployments

Date: 2026-10-04. gcloud 587.0.0, a new dedicated project with billing,
region `asia-northeast1`. The project was deleted afterwards.

Setup, following the provider READMEs' prerequisites: Run, Artifact Registry,
Cloud Build, Compute, IAM and Logging APIs; a Docker repository; a runtime
service account with no roles; a build service account with
`roles/cloudbuild.builds.builder`; a caller service account granted
`roles/run.invoker` on each service only. The probe was an e2-small Debian 12 VM
with **no external IP** running as the caller account, in the default subnet with
**Private Google Access enabled**, reached through IAP SSH. It ran the repository's
`verifyHttp` with Node 24.21.0, adding a metadata-server ID token (audience =
service URL) to each request.

Cloud Run container:

1. `docker buildx build --platform linux/amd64 --load` on Apple silicon (QEMU).
   The same 18 cases passed against that image locally under emulation
2. Pushed and pinned by digest. buildx produced an OCI index with a linux/amd64
   manifest and an attestation manifest; Cloud Run accepted the index digest
3. `render.mjs`, `gcloud run services replace --dry-run`, then the real
   `replace`: service Ready with internal ingress and concurrency 1
4. From the VPC: 18/18 with an ID token; 403 without one
5. From the internet with a valid user ID token: 404 (ingress)

The first in-VPC run, about a minute after granting `roles/run.invoker`, failed
all cases; status codes were not captured. A rerun a minute later passed 18/18
without other changes, consistent with IAM propagation delay.

Cloud Run functions:

1. `deploy.sh --execute` with the README's variables. Source deploy created an
   extra `cloud-run-source-deploy` repository, after a Y/n prompt that the
   non-interactive shell accepted by default. `deploy.sh` itself takes no
   `--quiet`
2. Deployed with internal ingress, IAM check, concurrency 1, 30-second timeout,
   max 3 instances and the runtime account
3. From the VPC with an ID token: 18/18 as `application/octet-stream`. As
   `application/json`, 15 passed and the 3 known framework-rejected fixtures
   (invalid JSON, body limit, trailing text) failed, matching the local record
4. 403 without a token from the VPC; 404 with a valid token from the internet

## Compiler pin moved to the v0.66.0 release

Building the compiler from source dominated every build: about 7.5 minutes on an
Apple silicon Mac, and 5m46s of a 7m18s `docker compose build` on a 4-core VPS.
The official `v0.66.0` release (2026-10-03) ships linux x86_64/aarch64 and macOS
binaries with a checksum file, so the pin moved from source commit `852b028` to
that release. Its tag commit `819bbc7` and `852b028` have diverged (30 and 155
commits apart), so it is a different compiler and was re-verified:

1. `install-almide.sh` downloads the platform archive and installs it only if its
   sha256 matches `.almide-checksums.sha256` (copied from the release's
   `almide-checksums.sha256`). 2.4 seconds on macOS arm64
2. The installer tests stub only the download: a matching archive installs
   `almide` and `almide-verify`; a wrong checksum installs nothing; a malformed
   tag is refused before any download
3. macOS arm64, Node 24.21.0: `npm test` 117/117, `test:workers` 19/19,
   `test:google-framework` 39/39, `test:staged-functions` 38/38. App build 7 s
4. The release binary needs glibc 2.39+, so it fails on Debian bookworm; the
   Dockerfile moved to `rust:1.99.0-trixie` / `debian:trixie-slim`. Native
   `almide build` still emits Rust and runs cargo (it fails without cargo), so
   the build stage keeps Rust
5. macOS arm64 `docker build`: 10 s with cached base images; Compose and the 18
   cases passed, read-only root filesystem and UID 65532 retained
6. ConoHa VPS x86_64 (below): 91 s including base-image pulls, 24 s with
   `--no-cache`; 18 cases passed

License texts are identical at both pins.

### Cloudflare and Google rerun with the release binary

Same day, from main at `916f22c`, using the same procedure as the earlier
[Cloudflare](#cloudflare-workers-edge-deployment) and
[Google](#google-cloud-deployments) sections (a new disposable Google project,
deleted afterwards):

1. Cloudflare Workers: upload 28.90 KiB (gzip 11.47 KiB), startup 18 ms. Two
   requests got the 1042 propagation 404, then 18/18 passed from the KIX colo; no
   500 this time. `wrangler delete` removed it
2. linux/amd64 image under QEMU on Apple silicon: 91 s
3. Cloud Run container from the digest-pinned image: 18/18 from the in-VPC VM
   with an ID token; 403 without a token; 404 from the internet with a token
4. Cloud Run functions via `deploy.sh --execute`: 18/18 as
   `application/octet-stream`; as JSON the same 3 framework rejections; 403 / 404
   negatives as before
5. Waiting about 90 seconds after granting `roles/run.invoker` avoided the
   propagation failures seen in the first run

## ConoHa VPS

Date: 2026-10-04. Created with [providers/conoha/terraform](../providers/conoha/terraform/)
(Terraform 1.14.9, the Aid-On fork of the conohavps provider at `ff59ace`, built
locally and used through `dev_overrides`), region c3j1.

1. `terraform plan`: 5 to add (server, boot volume, key pair, security group, one
   SSH rule from the operator's /32). Existing servers, keys and groups in the
   account were not in the plan and were unchanged afterwards
2. `terraform apply`: 1m10s. `g2l-t-c4m4`, `vmi-docker-29.2-ubuntu-24.04-amd64`:
   Ubuntu 24.04.4, x86_64, 4 vCPU, 3.8 GiB, Docker 29.2.1, Compose v5.0.2. The
   account's second server was accepted
3. First boot ran unattended upgrades through cloud-init for about 15 minutes;
   the build waited for `cloud-init status --wait`
4. ConoHa README commands from a clone of the repository:
   - with the source-build installer (main at `42cecaa`): build 7m18s (compiler
     5m46s); `/health`, `/greet` and the 18 cases passed
   - with the release installer (`4f72f7b`): build 91 s including base-image
     pulls, 24 s with `--no-cache`; the 18 cases passed
5. The 18 cases ran from the Mac through `ssh -L` to the VPS loopback. The app
   listened only on `127.0.0.1:8080`; port 8080 on the public address was not
   reachable. The container ran as 65532 with a read-only root filesystem and
   `CapDrop=[ALL]`; `docker compose down` took 0.5 s
6. `terraform destroy` removed all 5 resources; the VPS existed about 23 minutes

## /notes: storage decided by Almide, performed by the host

Date: 2026-10-04, Almide `v0.66.0` release binary. The probe that settled the
design: `http.get` builds natively but a `--target wasm --host js` build refuses
it (E081), while a synchronous `@extern(wasm, "js", ...)` builds. JS storage APIs
are asynchronous, so `api.step` returns the reads it needs and the write to make,
and each host performs them (root README, "Storage: Almide decides, the host
performs").

Local (macOS arm64, Node 24.21.0):

1. `npm test` 156/156: the 10-request scenario through generated Wasm with an
   in-memory store, the stored document, 503 without a store, 500 on a corrupt
   document, the 50-note cap; native with `STORE_DIR` (and notes surviving a
   server restart) and native without storage (503); the Node function host with
   an injected store, and Lambda without one (503)
2. `test:workers` 29/29 with a local KV (`--persist-to` a fresh directory);
   `test:google-framework` 39/39; `test:staged-functions` 38/38
3. Compose with the named volume: 18 cases + the scenario, then `down` / `up`
   kept both notes; root filesystem still read-only, UID 65532

Live:

1. Cloudflare Workers: `wrangler deploy` provisioned the KV namespace
   `almide-cloud-example-notes` from the id-less binding. 18 cases + the scenario
   passed (29/29); `wrangler kv key get notes --remote` returned exactly the two
   saved notes. `wrangler delete` left the namespace; it was deleted separately
2. Google, a new disposable project (deleted afterwards), one bucket per service
   with public access prevention, `roles/storage.objectUser` for the runtime
   account on each bucket only:
   - Cloud Run container with `GCS_BUCKET`: the Almide server took the
     metadata-server token and read/wrote Cloud Storage with `http.request`.
     From the in-VPC VM with an ID token: 18/18 and the scenario 11/11
   - Cloud Run functions with `GCS_BUCKET` via `deploy.sh`: the Node host read
     and wrote with `fetch`. 18/18 and the scenario 11/11 (octet-stream bodies)
   - Each bucket's `notes` object held exactly the two saved notes
     (`application/json`, 53 bytes); unauthenticated requests got 403
3. The ConoHa VPS: see [ConoHa VPS with /notes](#conoha-vps-with-notes)

Not shown: behavior under concurrent writers. The single-key read-modify-write
has no conditional write, so concurrent instances can lose a note.

## /notes on JS hosts: Almide calls the store through JSPI

Date: 2026-10-04. Compiler: Almide `fix-3353` at `e9eb4bb90` (unreleased,
[almide/almide#3353](https://github.com/almide/almide/issues/3353)), built locally
and passed as `ALMIDE_BIN`. Node 24.21.0, Wrangler 4.147.0.

The Wasm route used to return `step`'s reads and write to the JS host, which
performed them (`adapters/step.mjs`). Now `src/wasm.almd` runs the same loop as
the native host and calls the hooks `store_get` / `store_put` itself. Their
`@extern` carries `returns: promise`; the generated `app.d.ts` has
`serve(...): Promise<string>` and `handle(...): string`.
`adapters/store.mjs` binds the hooks to a store.

Local:

1. `npm test`: 158/158. Under Node 22 (no JSPI) the storage tests fail, and
   `init()` refuses with a message naming the missing JSPI
2. `npm run test:workers` (local workerd, fresh KV state): 29/29
3. 20 concurrent `POST /notes` to local workerd: 20 × 201, and all 20 notes stored
   with distinct `n` (one isolate runs one call at a time)
4. `npm run check:workers`: bundle 41.05 KiB, `NOTES` bound

Live (Cloudflare Workers, deployed with `wrangler deploy`, then deleted):

1. KV namespace provisioned from the id-less binding; 18 cases + the scenario
   passed (29/29)
2. `wrangler tail`: 22 requests, every outcome `ok`, 0 exceptions
3. 20 concurrent `POST /notes`: 20 × 201, but the list grew by only 5. Requests
   spread over several isolates, and each does a read-modify-write of one KV key
   with no conditional write. This is the limitation the root README describes,
   now measured. It is unchanged by this route
4. `wrangler delete` and `wrangler kv namespace delete`; the URL then answered
   Cloudflare error 1042 (no Worker)

Live (Cloud Run functions, `providers/google-cloud-functions/terraform`, a new
disposable project deleted afterwards; probe VM with no external IP, Private
Google Access, IAP SSH, as in the earlier Google runs):

1. Apply with the default `nodejs24`: 16 resources in 161 s. Every request
   answered 500, and the log showed the generated refusal: "this module awaits
   async JS imports (store_get, store_put) through JSPI, and this runtime has no
   WebAssembly.Suspending / WebAssembly.promising". Google's `nodejs24` image tags
   ran up to `nodejs24_20260926_24_19_0_RC00`, which is Node 24.19.0. Locally,
   JSPI is on by default from 24.20.0 (24.0.0 through 24.19.0: off; 24.20.0,
   24.21.0, 25.9.0, 26.10.0: on). On 24.19.0, `--experimental-wasm-jspi` enables
   it, but Node refuses that flag in `NODE_OPTIONS`, and
   `v8.setFlagsFromString` at run time does not install the API
2. Terraform gained `var.runtime` (default `nodejs24`), and `deploy.sh` gained
   `GCP_BASE_IMAGE`. Re-applied with `runtime = nodejs26` (beta, image
   `nodejs26_20260929_26_7_0_RC00`): 1 changed in 65 s
3. From the VM with an ID token: 18/18 as octet-stream, the `/notes` scenario
   11/11, and as JSON the same 3 known framework rejections. Without a token: 403
4. The bucket's `notes` object held exactly the two saved notes
   (`application/json`, 53 bytes), written by Almide through `store_put`
5. 20 concurrent `POST /notes` (max 3 instances, concurrency 1): 17 × 201 and
   3 × 503. The 503s were Almide's `storage_unavailable` after Cloud Storage
   answered 429 to rapid writes of one object. Almide logged
   `storage write failed: GCS write: HTTP 429` itself. 14 of the 17 accepted
   notes were kept; the rest were lost to the read-modify-write race
6. `terraform destroy` removed 16 resources; the project was deleted

CI's Node was 24.19.0, so it moved to 24.21.0. `engines` now says `>=24.20.0`.

## Terraform for Cloudflare and Google

Date: 2026-10-04, Terraform 1.14.9, providers cloudflare 5.26.0, google 8.5.0,
archive 2.8.1, time 0.14.2. Each configuration was applied, checked with the
same tests as the CLI deployments, planned again (no changes) and destroyed.
The application was main at `c904bf7`.

1. Cloudflare (`providers/cloudflare-workers/terraform`), with the Wrangler
   login's token as `CLOUDFLARE_API_TOKEN`: 4 resources (KV namespace, Worker,
   version with `worker.js` and the imported Wasm, deployment). 18 cases and the
   `/notes` scenario passed from the edge (29/29); KV held the two saved notes.
   `destroy` removed all 4 including the namespace. The API reported the Worker
   gone at once; the URL answered 200 for a few seconds, then 404
2. Google, a new disposable project (deleted afterwards), credentials through
   `GOOGLE_OAUTH_ACCESS_TOKEN`; the probe VM and caller account were made with
   gcloud, outside Terraform:
   - Cloud Run (`providers/google-cloud-run/terraform`): 8 resources, then the
     image was pushed to the created repository and the second apply made the
     service and the invoker grant (2). Ingress internal, concurrency 1, the
     runtime account, invoker = the caller only. From the in-VPC VM: 18/18 and
     the scenario 11/11; the bucket held the two notes; internet with a token
     404; no token 403
   - Cloud Run functions (`providers/google-cloud-functions/terraform`): 16
     resources in 183 s (including the 60-second wait for the build account's
     grant). The first requests got 403 `run.routes.invoke` until the invoker
     grant propagated a few minutes later; then 18/18 octet-stream, the 3 known
     framework rejections as JSON, the scenario 11/11, and the two notes in GCS
   - `destroy` removed 10 and 16 resources. Cloud Functions' own
     `gcf-v2-sources-*` bucket and `gcf-artifacts` repository were not managed
     by Terraform and remained until the project was deleted

## ConoHa VPS with /notes

Date: 2026-10-04, main at `e73081a`, the same Terraform (`g2l-t-c4m4`, SSH from
the operator's /32 only); the provider installed with `go install` and
`~/.terraformrc` dev_overrides.

1. `terraform apply`: 5 resources in about 30 s; Ubuntu x86_64, Docker 29.2.1
2. cloud-init's first-boot upgrades took 714 s; `docker compose build` 98 s
3. Through `ssh -L` to the VPS loopback: the 18 cases and the `/notes` scenario
   passed (29/29). The container ran with `STORE_DIR=/data`, a read-only root
   filesystem, UID 65532 and `CapDrop=[ALL]`; the app listened on
   `127.0.0.1:8080` only and port 8080 on the public address was unreachable
4. `notes.json` in the `conoha_notes` volume (owned by 65532) held exactly the
   two saved notes; after `docker compose down` (0.6 s) and `up` the list was
   unchanged
5. `terraform destroy` removed all 5; only the account's existing server and
   its volume remained

## Not established

- Native x86_64 Docker build outside the ConoHa VPS
- `/notes` under concurrent writers is safe on any route (measured on Workers: writes are lost across isolates)
- ConoHa TLS/reverse proxy, restart behavior, production load, or plans smaller
  than `g2l-t-c4m4`
- Azure Container Apps or ECS Fargate provider validation/deployment
- Lambda managed runtime or Azure Functions host execution/authentication
- Google Cloud costs, load, cold-start latency or long-running behavior
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

For a Docker gate, run the Compose commands in the ConoHa README on a machine with
Docker and verify `/health` and `/greet`. Deployments require a separate,
explicit decision.

## Upstream references

- [HTTP server semantics at the pin](https://github.com/almide/almide/blob/v0.66.0/docs/stdlib/http.md)
- [Generated JS host at the pin](https://github.com/almide/almide/blob/v0.66.0/src/cli/js_host.rs)
- [JS host contract at the pin](https://github.com/almide/almide/blob/v0.66.0/docs/wasm/WASM-OUTPUT.md)
