# Azure Container Apps: native container route

Status: **configuration candidate; not deployed to Azure**. ARM field names and
constraints were reviewed against Microsoft's stable `2025-07-01` API reference
on **2026-10-04**. Local JSON/static checks are not Azure resource-provider
validation. Neither Docker nor Azure CLI was available during this review, so
image build/push, ARM validation/what-if, managed-identity pull, private DNS,
probes, scaling and live endpoint behavior remain unverified.

[main.json](main.json) creates just one Container App. It uses the repository's
[root Dockerfile](../../Dockerfile) and the same native Almide HTTP server; no
Azure SDK, framework, sidecar, new application implementation or cloud-specific
compiler backend is needed. It creates **no** environment, registry, identity,
role assignment, network, DNS zone, Key Vault or logging workspace.

## Existing prerequisites and security boundary

An operator must supply and review:

- An existing resource group and Container Apps managed environment in the same
  region as `location`, with the `Consumption` workload profile. This template
  deliberately targets workload-profile environments, not Azure Arc or legacy
  Consumption-only environments
- An existing ACR repository containing the tested **Linux x86-64 / amd64** image,
  plus an existing user-assigned managed identity authorized to pull it. Use
  `AcrPull` for a non-ABAC registry or `Container Registry Repository Reader` for
  an ABAC-enabled registry, scoped to the required repository where supported.
  ACR must allow ARM-audience authentication tokens. The deployer needs permission
  to create/update this app, join the environment and assign that identity;
  identity role assignments must already be effective. This template grants none
- Existing networking/DNS/egress that permits image pulls and Azure platform
  dependencies. An ACR private endpoint or firewall can block a correctly
  authorized identity; IAM alone does not establish network access
- An authenticated Azure CLI session with the intended subscription, required
  resource providers and Container Apps commands already available. Install,
  login, registration, IAM and networking setup are separate operator actions

The app has **no application authentication**. `ingress.external: false` restricts
its direct hostname to callers in the **same Container Apps environment**. A VM
merely attached to the same VNet is not a supported test client for this setting.
Other apps in that environment can call it. Furthermore, an environment-level
HTTP route or a public proxy app can forward external requests to an internal
app: verify that no such route/proxy targets this sample. Internal ingress alone
is not tenant isolation or caller authorization.

For an additional outer boundary, select an existing internal/VNet-integrated
environment with reviewed private DNS and routing. This template neither builds
nor verifies that boundary. Do not change `external` to `true` as a workaround
for failed tests: on a public environment that can publish this unauthenticated
API. `allowInsecure: false` redirects HTTP ingress to HTTPS; ingress terminates
TLS and forwards HTTP to the process on port 8080.

The pull identity is assigned with `identitySettings.lifecycle: None`: the
platform can use it for image pull, but application code is not given its tokens.
No registry password is stored in the template.

References: [ARM contract](https://learn.microsoft.com/en-us/azure/templates/microsoft.app/2025-07-01/containerapps),
[image-pull prerequisites](https://learn.microsoft.com/en-us/azure/container-apps/managed-identity-image-pull),
[ACR identity roles](https://learn.microsoft.com/en-us/azure/container-registry/container-registry-authentication-managed-identity),
[identity lifecycle](https://learn.microsoft.com/en-us/azure/container-apps/managed-identity),
[ingress boundaries](https://learn.microsoft.com/en-us/azure/container-apps/ingress-overview).

## Build and choose an immutable image

These commands are **documentation only**. Nothing in the repository's ordinary
build/test workflow logs in, pushes an image or deploys. Only run cloud-changing
steps after reviewing the target, permissions and costs. From the repository
root, with Docker Engine/Buildx installed and registry authentication already
established:

```sh
ACR_NAME='REPLACE_WITH_EXISTING_REGISTRY_NAME'
REGISTRY_SERVER='REPLACE_WITH_REGISTRY_LOGIN_SERVER'
TAG='REPLACE_WITH_UNIQUE_BUILD_TAG'
IMAGE="$REGISTRY_SERVER/almide-api:$TAG"

docker buildx build --platform linux/amd64 --tag "$IMAGE" --load .
docker run --rm --detach --name almide-azure-local \
  --publish 127.0.0.1:8080:8080 "$IMAGE"
curl --fail http://127.0.0.1:8080/health
curl --fail http://127.0.0.1:8080/greet \
  -H 'content-type: application/json' --data '{"name":"Azure"}'
docker stop almide-azure-local

# Changes the existing registry; run only when authorized.
docker push "$IMAGE"
# Read the digest from the registry after the push, not the local image ID.
az acr repository show --name "$ACR_NAME" --image "almide-api:$TAG" \
  --query digest --output tsv
```

Use the returned SHA-256 digest, removing only the `sha256:` prefix, for the
`imageDigest` parameter. The template forms
`registry/repository@sha256:<64-hex-digest>`; deployment never follows a mutable
tag. Confirm that this digest identifies the tested amd64 image. ARM's length
constraints do not prove the digest exists or validate its architecture.

The shared image runs as UID/GID 65532 and uses `PORT=8080`. Its compiler build is
substantial; build on a suitably sized machine. Explicit `--platform` matters
on ARM laptops. Base images currently use version tags, so pinning the deployed
image digest does not make source rebuilds fully hermetic.

References: [supported containers/resources](https://learn.microsoft.com/en-us/azure/container-apps/containers),
[ACR image inspection](https://learn.microsoft.com/en-us/cli/azure/acr/repository?view=azure-cli-latest#az-acr-repository-show).

## Review parameters, then deploy deliberately

```sh
cp providers/azure-container-apps/parameters.example.json \
  providers/azure-container-apps/parameters.local.json
```

Edit the ignored local file. Replace **every** `REPLACE_WITH` value, all-zero
subscription ID, and all-zero image digest. Use a new app name rather than
silently overwriting an unrelated app. `environmentResourceId` and
`pullIdentityResourceId` are full existing resource IDs; `registryServer` is only
the login hostname. Never put passwords, tokens or secret values in parameters.

After separately checking the current Azure subscription and target group:

```sh
RESOURCE_GROUP='REPLACE_WITH_EXISTING_APP_RESOURCE_GROUP'
PARAMETERS='providers/azure-container-apps/parameters.local.json'
TEMPLATE='providers/azure-container-apps/main.json'

# Azure calls, but no deployment. Review all validation/what-if results.
az deployment group validate --resource-group "$RESOURCE_GROUP" \
  --template-file "$TEMPLATE" --parameters "@$PARAMETERS"
az deployment group what-if --resource-group "$RESOURCE_GROUP" \
  --mode Incremental --template-file "$TEMPLATE" --parameters "@$PARAMETERS"

# Creates/updates a billable Container App. Only run after approval.
az deployment group create --resource-group "$RESOURCE_GROUP" \
  --name almide-container-app --mode Incremental \
  --template-file "$TEMPLATE" --parameters "@$PARAMETERS"
```

An incremental ARM deployment does not remove unrelated resources, but the app's
properties are still declarative: later template deployments can reset manual
app changes. Keep any intentional configuration changes in the template you
actually deploy. `Single` revision mode promotes a ready revision automatically;
changing the image creates a revision, but this example has no staged release or
rollback automation. Keep the previous known-good image digest available.

## Health, scaling and internal smoke test

- Explicit startup, liveness and readiness probes all perform `GET /health` on
  HTTP port 8080. Success proves the handler responds; it does not check any
  downstream dependencies or load capacity
- Each replica requests 0.25 vCPU and 0.5 GiB. The HTTP scaler targets
  `concurrentRequests: "1"`, with 0–2 replicas. Zero permits cold starts;
  scaling is asynchronous. This target **does not enforce a one-request
  concurrency limit or a strict spending cap**
- Almide's current `http.serve` handles requests sequentially per process.
  A slow client can occupy that process and delay probes. The probes' 5-second
  timeout and failure thresholds are starting values, not load-tested tuning.
  Test before serving real traffic; autoscaling does not remove the transport's
  30-second limits, 1 MiB wire-body limit or the shared API's smaller body limit

From the operator terminal, obtain the generated internal hostname:

```sh
APP_NAME='almide-api' # use the name in your parameters file
az containerapp show --resource-group "$RESOURCE_GROUP" --name "$APP_NAME" \
  --query properties.configuration.ingress.fqdn --output tsv
```

Run the following **inside an existing approved diagnostic app in the same
Container Apps environment**, with curl and working DNS/CA certificates. Use its
existing exec/console access; this example does not deploy a test client. The
shared minimal runtime image does not bundle curl, so its shell is not the test
client. A local laptop, ordinary Cloud Shell or VNet-only VM is not sufficient.

```sh
APP_FQDN='REPLACE_WITH_RETURNED_FQDN'
curl --fail --show-error "https://$APP_FQDN/health"
curl --fail --show-error "https://$APP_FQDN/greet" \
  -H 'content-type: application/json' --data '{"name":"Azure"}'
```

Expected JSON: `{"ok":true}` and `{"message":"Hello, Azure!"}`. Do not disable TLS
certificate verification or open ingress to make the test pass. Also verify that
the app has no intended public path through environment routing or other apps.

References: [health probes](https://learn.microsoft.com/en-us/azure/container-apps/health-probes),
[HTTP scaling](https://learn.microsoft.com/en-us/azure/container-apps/scale-app),
[communication between apps](https://learn.microsoft.com/en-us/azure/container-apps/connect-apps).

## Environment variables and secret references

Only `PORT` is consumed by this sample; its health/greeting endpoints need no
secrets. Additional ordinary settings belong in the container's `env` array as
`{"name":"SETTING_NAME","value":"non-secret-value"}`. Do not treat an environment
variable named `API_KEY` as authentication: the current handler does not read it.

If future application code actually needs a secret, review the extra access
first. Use an existing Key Vault secret and a separately scoped existing
user-assigned identity. Add that identity to `identity.userAssignedIdentities`
and to `configuration.identitySettings` with lifecycle `None` if only the
platform needs it. Merge a reference into `configuration.secrets`:

```json
{
  "name": "service-secret",
  "keyVaultUrl": "https://REPLACE_WITH_VAULT.vault.azure.net/secrets/REPLACE_WITH_SECRET/REPLACE_WITH_VERSION",
  "identity": "/subscriptions/REPLACE_WITH_SUBSCRIPTION/resourceGroups/REPLACE_WITH_GROUP/providers/Microsoft.ManagedIdentity/userAssignedIdentities/REPLACE_WITH_SECRET_IDENTITY"
}
```

Then add `{"name":"SERVICE_SECRET","secretRef":"service-secret"}` to the
container's existing `env` array, retaining `PORT`. These are fragments, not
standalone templates or values to deploy unchanged. The identity must already
be authorized to read the selected secret (for RBAC vaults, `Key Vault Secrets
User`) and the environment must have the required network/DNS access. Nothing
here grants access. Use a versioned URI for explicit rotation; versionless
references follow new versions and can restart active revisions. Never output,
commit or log resolved secret values.

Reference: [Key Vault references and rotation](https://learn.microsoft.com/en-us/azure/container-apps/manage-secrets).

## Logs, costs and cleanup

Inspect system events and the `api` container's stdout/stderr:

```sh
az containerapp logs show --resource-group "$RESOURCE_GROUP" --name "$APP_NAME" \
  --type system --tail 50
az containerapp logs show --resource-group "$RESOURCE_GROUP" --name "$APP_NAME" \
  --type console --container api --tail 50
```

For multiple replicas/revisions, add the desired `--revision` and `--replica`.
A scale-to-zero app might have no running replica/console stream. The sample
adds no request logger and does not log request bodies or secrets; an empty
console stream is not evidence of failure. Durable retention/query access
comes from the existing environment's logging configuration, which this
template does not change.

Consumption compute/memory and applicable request charges can apply; cold
starts and scale-out consume resources. Existing ACR storage, logs/retention,
network egress, private endpoints, gateways and any other environment workloads
can continue to cost money even when this app has scaled to zero. Check regional
pricing and budgets before deployment; free grants are not a guarantee of a
zero-cost test. Dedicated-profile environments have additional billing behavior;
this sample selects Consumption explicitly.

For cleanup, verify the subscription, group and app name, then delete **only this
sample app** when its service interruption and loss of revisions are acceptable:

```sh
# Destructive: removes this app and its revisions; prompts for confirmation.
az containerapp delete --resource-group "$RESOURCE_GROUP" --name "$APP_NAME"
```

Do not delete a shared resource group or managed environment. Removing the app
does not remove ACR images, the user-assigned identity, role assignments, Key
Vault secrets, networking or retained logs. Review those independently with
their owners, including remaining costs and rollback dependencies. Deleting an
ARM deployment record alone does not delete the app.

References: [log streams](https://learn.microsoft.com/en-us/azure/container-apps/log-streaming),
[Container Apps pricing](https://azure.microsoft.com/en-us/pricing/details/container-apps/),
[CLI deletion](https://learn.microsoft.com/en-us/cli/azure/containerapp?view=azure-cli-latest#az-containerapp-delete).
