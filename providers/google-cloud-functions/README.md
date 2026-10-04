# Google Cloud Run functions: Wasm in Node.js 24

The current product name is **Cloud Run functions**. This directory retains
`google-cloud-functions` for discoverability. Functions Framework registers
the `almideApi` HTTP entry point; the shared Node host loads the generated Wasm.
This is a source-function route, separate from the native Cloud Run container.

## Local preparation

From the repository root, after the normal compiler build:

```sh
node scripts/package-faas.mjs google-cloud-functions
node --test tests/faas.test.mjs
cd build/packages/google-cloud-functions
npm ci --omit=dev --ignore-scripts
PORT=8080 npm start
```

The package locks Functions Framework and all transitive dependencies.
`package.json` must be at the staging root; `main` points to the provider's ESM
registration module. Do not deploy the repository root, its compiler sources,
development dependencies, or local credentials.

## Optional private cloud deployment

Create/review the project, enabled APIs, build identity and runtime identity
first, using Google's deployment documentation. Use a dedicated runtime service
account with no unnecessary API roles; the build service account needs the
documented build permissions. Identities and caller roles are not provisioned
by this sample. The runtime's identity does not authenticate an incoming caller.

Set these values in your shell:

```sh
export GCP_PROJECT=YOUR_PROJECT
export GCP_REGION=YOUR_REGION
export GCP_SERVICE=YOUR_NEW_SERVICE
export GCP_SERVICE_ACCOUNT=RUNTIME_ACCOUNT@YOUR_PROJECT.iam.gserviceaccount.com
export GCP_BUILD_SERVICE_ACCOUNT=projects/YOUR_PROJECT/serviceAccounts/BUILD_ACCOUNT@YOUR_PROJECT.iam.gserviceaccount.com
```

From the repository root, `bash providers/google-cloud-functions/deploy.sh`
only prints a reviewed, shell-escaped command. Adding `--execute` runs it and
uploads source, builds/stores an image, and deploys a billable service. Neither
command is run by the default build/test workflow. Cloud deployment is untested.

The helper selects Node 24, internal ingress, enforced invoker IAM checks, no
unauthenticated access, one request per instance, zero minimum and three maximum
instances, 256 MiB memory, and a 30-second request timeout. The maximum is an
operational limit, not a hard spending cap. Cloud Build/Artifact Registry can
charge separately.

Internal ingress means ordinary external curl or a local browser is not an
accepted origin, even with a valid token. Test from an allowed internal source
with an ID token and an intended caller granted Cloud Run Invoker. A public
internet-facing authenticated service would need an intentional ingress change;
do not disable IAM or grant `allUsers` just to make a smoke test pass.

When finished, review `gcloud run services delete SERVICE --project PROJECT
--region REGION` for the exact service you created. Build artifacts in Artifact
Registry and logs may need separate cleanup; do not delete shared repositories.

## Configuration, secrets and logs

Cloud Run environment values are host-side `process.env` configuration; they
are not automatically passed into the compiled Almide function by `callApi`.
The sample needs no secrets and implements no secret retrieval. A later Secret
Manager binding or host-side client needs a specific secret/version and minimal
service-identity access, with an explicit API boundary if Almide needs that
value. Do not place secret literals in deployment arguments, source packages,
committed environment files or logs.

Cloud Logging can collect platform request logs and container stdout/stderr.
The shared greeting implementation adds no application logging, so platform
logs do not imply per-request Almide tracing. Keep payloads and credentials out
of host diagnostics. Review logging retention/ingestion, source-build charges
and retained Artifact Registry images when assessing cost and cleanup.

See [Secret Manager bindings](https://docs.cloud.google.com/run/docs/configuring/services/secrets),
[Cloud Run logging](https://docs.cloud.google.com/run/docs/logging)
and the [deployment safety guide](../../docs/deployment-safety.md).

## Contract and limits

- `handler.mjs` converts Express-style request/response objects. `req.rawBody`
  preserves the original bytes; parsed objects are never re-serialized as input
- The Functions Framework parses requests before calling the handler based on
  Content-Type. In particular, malformed or trailing JSON sent as
  `application/json` can be rejected before Almide runs. Those errors need not
  have the shared API's JSON error shape; framework validation is stricter
- Direct adapter tests cover all 18 shared cases using raw-body fixtures. They
  are not a claim of identical managed HTTP behavior. To probe raw-body parity
  through the framework, use `application/octet-stream`; normal valid JSON can
  use `application/json`
- The packaged Functions Framework 5.0.5 was also exercised locally: 39 tests
  passed. All 18 octet-stream cases reached the shared behavior. Three JSON
  fixtures (invalid JSON, an oversized malformed body, and trailing JSON) instead
  produced framework 400 HTML responses; a valid oversized JSON body still
  reached Almide's 413. This is local framework evidence, not a cloud result
- HTTP functions and CloudEvents functions have different signatures. Pub/Sub,
  Cloud Storage and other Eventarc integrations need a distinct event adapter,
  plus retry/idempotency design; this sample does not register an event function
- Published limits include up to 60 minutes for HTTP functions and a 32 MB
  uncompressed request ceiling for 2nd-generation functions. Deployment surface
  and frontend matter; this sample uses a much smaller application-body limit
  and a 30-second timeout
- Cloud IAM, source build, managed runtime, ingress and deployment are untested
  unless a later verification record explicitly states otherwise

Official sources, checked 2026-10-04:
[writing functions and rawBody](https://docs.cloud.google.com/run/docs/write-functions),
[Node runtimes](https://docs.cloud.google.com/run/docs/runtimes/nodejs),
[source deployment and IAM](https://docs.cloud.google.com/run/docs/deploy-functions),
[deploy flags](https://docs.cloud.google.com/sdk/gcloud/reference/run/deploy),
[ingress](https://docs.cloud.google.com/run/docs/securing/ingress),
[function limits](https://docs.cloud.google.com/functions/quotas).
