# Google Cloud Run: native container route

Deploy the shared [Dockerfile](../../Dockerfile) as one Cloud Run service. It runs
the existing Almide binary, with no Google SDK or additional application server.
`GET /health` returns `{"ok":true}`; `POST /greet` with `{"name":"Almide"}` returns
`{"message":"Hello, Almide!"}`.

**Status:** on 2026-10-04 the commands below were run in a dedicated, disposable
project in `asia-northeast1`: linux/amd64 image built with buildx (QEMU on Apple
silicon), pushed and pinned by digest, rendered, validated with `--dry-run` and
deployed. From a VM inside the same VPC, the shared 18-case HTTP contract passed
with an ID token, and an unauthenticated request got 403. From the internet, a
request with a valid token got 404 from ingress. The project was then deleted.
Every cloud command below is an operator-run example, not part of the
repository's build/test workflow.

## Defaults and prerequisites

[service.template.yaml](service.template.yaml) is JSON, which is also valid YAML,
using the [Cloud Run Admin API v1 service schema](https://docs.cloud.google.com/run/docs/reference/yaml/v1).
It selects second-generation execution, 1 vCPU, 512 MiB, concurrency **1**, a
60-second request timeout, request-based CPU allocation, zero minimum instances,
and a service-level maximum of two instances. The native `http.serve` loop is
sequential; increasing Cloud Run concurrency does not make it parallel. The
transport's own 30-second limits still apply. A new revision receives 100% of
traffic, so this is not a canary rollout template.

Before deployment, arrange these prerequisites through your normal approval
process. This example does not create or change them:

- An existing billing-enabled Google Cloud project, an allowed Cloud Run region,
  enabled Cloud Run and Artifact Registry APIs, and an existing Docker-format
  Artifact Registry repository. Use an appropriately located repository.
- An already authenticated Google Cloud CLI and Docker/buildx installation with
  permission to push to that repository. Registry authentication is separate
  from application invocation; follow the [Artifact Registry push guide](https://docs.cloud.google.com/artifact-registry/docs/docker/pushing-and-pulling).
- A deployer with Cloud Run deployment permission, Artifact Registry read access,
  and `iam.serviceAccounts.actAs` on a dedicated runtime service account. The
  Cloud Run service agent must be able to read the image too; cross-project
  repositories need additional IAM setup. See [deployment permissions](https://docs.cloud.google.com/run/docs/deploying).
- An existing user-managed runtime service account, preferably in the same
  project. This greeting service calls no Google APIs, so it needs no project
  roles. Do not attach an editor/admin identity or put a service-account key in
  the image. See [service identity](https://docs.cloud.google.com/run/docs/configuring/services/service-identity).
- An authorized caller with `roles/run.invoker` and a network path admitted by
  internal ingress. Neither caller IAM nor a VPC/client is provisioned here.

### Private-by-default access

The service keeps the Invoker IAM check enabled and uses `internal` ingress.
Both checks matter: a valid identity token does not bypass the network boundary.
For example, a suitably routed VM in the same project's VPC can invoke it;
another Cloud Run service must route through a qualifying VPC. A normal laptop
request or local authentication proxy does not establish that path. See
[Cloud Run ingress rules](https://docs.cloud.google.com/run/docs/securing/ingress).
Internal ingress does not provision a private IP endpoint or private client.

Choose a fresh service name. Replacing service configuration does **not** clear
an existing IAM policy or inherited grants. Review service and ancestor policies
for `allUsers`, `allAuthenticatedUsers`, or unintended invokers. Keeping
`run.googleapis.com/invoker-iam-disabled` set to `"false"` only retains the IAM
check; it cannot undo an existing public invoker grant. See
[public access and re-enabling IAM checks](https://docs.cloud.google.com/run/docs/authenticating/public).

Deliberate alternatives, after a security review:

- To permit authenticated internet callers, change ingress to `all`, retain the
  IAM check, and grant only intended identities invocation permission.
- A load-balancer architecture can use `internal-and-cloud-load-balancing` with
  suitable frontend authentication and policies. It adds separate infrastructure
  and cost.
- A genuinely public demo also requires an explicit authentication-policy
  change. Review the public-access guide above; this repository neither disables
  the IAM check nor grants `allUsers`. The app has no application-level auth.

## Build, render, and deploy

Run from the repository root. Replace sample identifiers with existing resources.
Do not blindly paste a deployment over an existing service.

```sh
export PROJECT_ID='your-project-id'
export REGION='us-central1'
export REPOSITORY='your-existing-repository'
export SERVICE_NAME='almide-api-demo'
export RUNTIME_SERVICE_ACCOUNT="almide-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
export IMAGE_PATH="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/almide-api"
export IMAGE_TAG="${IMAGE_PATH}:reviewed-build"

# Local build; requires an amd64-capable builder or emulation on an ARM machine.
docker buildx build --platform linux/amd64 --load -t "$IMAGE_TAG" .
# Optional local smoke test; bind only host loopback. Stop with Ctrl-C.
docker run --rm -p 127.0.0.1:8080:8080 -e PORT=8080 "$IMAGE_TAG"
```

Use the root README's curl examples from another terminal. Cloud Run requires
Linux x86_64; a multi-architecture index must include `linux/amd64`. The existing
server listens on all interfaces and reads the injected `PORT`; the template
selects 8080 and HTTP/1. Cloud Run terminates HTTPS before forwarding to it. Do
not add TLS inside this container or override `PORT` in the service environment.
See the [container contract](https://docs.cloud.google.com/run/docs/container-contract).

The compiler build is much heavier than the deployed program. Docker base tags
in the shared Dockerfile are not digest-locked; pinning the deployed image fixes
the deployed bytes but does not make rebuilding hermetic. Review/scanning of that
image and graceful shutdown/load behavior remain operator responsibilities.

**The following push stores data in Google Cloud and can incur charges:**

```sh
docker push "$IMAGE_TAG"
docker buildx imagetools inspect "$IMAGE_TAG"
# Copy the returned full Digest (64 hexadecimal characters), not the mutable tag.
export IMAGE_DIGEST="${IMAGE_PATH}@sha256:REPLACE_WITH_64_HEX_DIGEST"
mkdir -p build
node providers/google-cloud-run/render.mjs > build/cloud-run.service.yaml
```

[buildx](https://docs.docker.com/reference/cli/docker/buildx/build/) builds the shared
image; [imagetools inspect](https://docs.docker.com/reference/cli/docker/buildx/imagetools/inspect/)
shows the registry digest. The renderer is local-only, rejects missing values and
mutable image tags, and writes JSON to stdout. It does not validate image
existence, architecture, IAM, quotas, or Google-side policy. Inspect the generated
file before continuing; `build/` is ignored by Git.

```sh
# Optional Google-side validation; still contacts the account/API.
gcloud run services replace build/cloud-run.service.yaml \
  --project "$PROJECT_ID" --region "$REGION" --dry-run

# Actual deployment: creates/updates resources and can incur charges.
gcloud run services replace build/cloud-run.service.yaml \
  --project "$PROJECT_ID" --region "$REGION"
```

The [replace command](https://docs.cloud.google.com/sdk/gcloud/reference/run/services/replace)
supports YAML specifications and optional validation without application. Both
the dry run and the real replace succeeded on 2026-10-04. If deployment fails, inspect
the returned error and revision logs; do not relax ingress or IAM as a shortcut.

## Verify the deployment from an authorized network

First review the deployed configuration and service IAM policy. Also have your
administrator review inherited project/folder/organization grants.

```sh
gcloud run services describe "$SERVICE_NAME" \
  --project "$PROJECT_ID" --region "$REGION" --format export
gcloud run services get-iam-policy "$SERVICE_NAME" \
  --project "$PROJECT_ID" --region "$REGION"
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')

# Development-only test: run where internal ingress allows this caller.
# Requires an already authenticated user with invocation permission.
curl --fail-with-body "$SERVICE_URL/health" \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)"
curl --fail-with-body "$SERVICE_URL/greet" \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  -H 'content-type: application/json' --data '{"name":"Cloud Run"}'
```

Expect `{"ok":true}` and `{"message":"Hello, Cloud Run!"}`. From an allowed network,
an unauthenticated request should fail before the handler; an internet request
should be rejected by ingress even with valid IAM credentials. Verify both
negative cases deliberately. Do not use shell tracing or log identity tokens.
The [developer token workflow](https://docs.cloud.google.com/run/docs/authenticating/developers)
is for manual testing. Production callers should use short-lived, audience-bound
service-account ID tokens, with the service URL as audience, following
[service-to-service authentication](https://docs.cloud.google.com/run/docs/authenticating/service-to-service).

## Health, configuration, and logs

Both probes use `GET /health` on port 8080. Startup allows 24 attempts, 10 seconds
apart, with a 5-second timeout; liveness uses three failures, 30 seconds apart,
with the same timeout. Liveness starts after startup succeeds; repeated failures
cause restart. Probes consume CPU/memory and are billed. See
[health-check configuration](https://docs.cloud.google.com/run/docs/configuring/healthchecks).
The health path tests this small process, not dependencies. Probes share the
sequential listener with application requests, so slow clients can delay them.
These are demo settings, not evidence of load-tested availability.

The app only consumes `PORT`. If extending it, add non-secret configuration with
container `env` entries. For secrets, use Secret Manager references rather than
plaintext `value` fields, Docker build arguments, committed `.env` files, or keys.
For example, an opt-in environment entry under the container is:

```json
{"name":"EXAMPLE_SECRET","valueFrom":{"secretKeyRef":{"name":"existing-secret-name","key":"1"}}}
```

This reference alone does not grant access. A separately approved setup must
enable Secret Manager, create the secret/version, and grant the runtime service
account `roles/secretmanager.secretAccessor` on that secret. Pin an environment
secret to a numbered version and deploy a new revision when rotating it. The
current application does not read this example variable. See
[Cloud Run secrets](https://docs.cloud.google.com/run/docs/configuring/services/secrets).

Cloud Run records request logs and captures container stdout/stderr in Cloud
Logging without a logging SDK. This program does not add structured request
logging; do not infer request-body logging or distributed tracing support.
Avoid secrets and personal request content in future log statements. See
[logging](https://docs.cloud.google.com/run/docs/logging).

```sh
gcloud run services logs read "$SERVICE_NAME" \
  --project "$PROJECT_ID" --region "$REGION" --limit=50
```

## Costs and cleanup

Zero [minimum instances](https://docs.cloud.google.com/run/docs/configuring/min-instances)
allows scale-to-zero but does not guarantee a zero bill. The service-level
[maximum of two](https://docs.cloud.google.com/run/docs/configuring/max-instances)
can be exceeded briefly and is not a spending cap. Requests, active compute,
probes, image storage, logging, network egress, and any separately added VPC,
load-balancer, build, or secret resources can incur charges. Check current
[Cloud Run pricing](https://cloud.google.com/run/pricing) and the other products'
prices; establish [budgets/alerts](https://docs.cloud.google.com/billing/docs/how-to/budgets)
before deployment. Alerts-only budgets are not hard spending limits.

After confirming the service is disposable, an operator can remove it:

```sh
gcloud run services delete "$SERVICE_NAME" \
  --project "$PROJECT_ID" --region "$REGION"
```

[Deletion](https://docs.cloud.google.com/run/docs/managing/services#delete-existing-services)
is permanent and removes the service's revisions. It does not remove Artifact
Registry images. Review and clean up only example-owned images, dedicated
identities, secrets, and network resources separately; retained resources and
logs may still cost money. Never delete shared prerequisites automatically.

Official documentation was checked on **2026-10-04**. Deployment, private
invocation and probes were verified once in a disposable project (see Status);
costs, load behavior and long-running operation were not.
