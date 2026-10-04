# Azure Functions: Wasm in Node.js 24

The v4 Node programming model registers `almideApi` using `app.http`. The
handler maps Azure HTTP requests to the shared Wasm-backed API. `host.json`
removes the default `/api` prefix so routes stay `/health` and `/greet`.

## Local preparation

From the repository root, after the normal compiler build:

```sh
node scripts/package-faas.mjs azure-functions
node --test tests/faas.test.mjs
cd build/packages/azure-functions
npm ci --omit=dev --ignore-scripts
FUNCTIONS_WORKER_RUNTIME=node func start --port 7071
```

Full local hosting requires Azure Functions Core Tools v4 separately installed.
Core Tools may require local development settings/storage depending on your
environment. Do not commit `local.settings.json`, connection strings or keys.
The portable tests use an HTTP-request-shaped object and the actual Wasm; they
do not start the Azure host or verify its binding registration.

## Optional deployment to an existing Function App

Use an explicitly reviewed **Node 24 / Functions runtime 4** Function App and
hosting plan with its required storage configured. Node 24 is generally
available, but **legacy Linux Consumption supports Node only up to 22**; use
Flex Consumption or another supported plan for this example. Region-specific
availability must be checked when provisioning. This sample does not create a
plan, storage account, permissions or Function App.

From the prepared staging directory, review and run the following only when
you intend to upload and publish to that existing app:

```sh
func azure functionapp publish YOUR_FUNCTION_APP --javascript
```

Publishing uploads code and can cause billable usage. It has not been run or
validated against an Azure account. Review app settings and platform support
before publishing; the package's Node engine declaration does not provision or
upgrade your app's managed Node runtime.

Publishing replaces the Function App's deployed application content, not just
one selected handler. Use a dedicated sample Function App, or preserve and
review the complete existing application before deployment. Do not publish this
small package into an app containing unrelated functions.

## Configuration, secrets, logs and cleanup

`/notes` has no store on this route: the adapter passes none, so `/notes`
answers 503 `storage_unavailable` (the shared `callApi` default, tested
through the Lambda adapter). A store would be a host-side
`{ get, put }` passed to `callApi`, as Cloud Run functions does with Cloud Storage.


Azure application settings appear in the Node host environment. `callApi`
does not pass those settings into Wasm; it currently sends only method, target
and body. No application secret retrieval is implemented. A later Key Vault
reference needs the intended vault/secret and least-privilege managed-identity
access, plus explicit host code if the value must be passed to Almide. Keep
secret literals, storage connection strings and keys out of packages, source
control and logs; use the platform's settings/reference mechanisms.

The Functions host emits its own logs, and Application Insights can collect
telemetry when configured. The pure handler currently adds no per-request
application logging; local adapter tests do not verify cloud telemetry. Avoid
logging request bodies or credentials. Hosting-plan, required storage,
Application Insights and retained log data can have costs separate from the
function's execution. A stopped or deleted handler does not necessarily remove
those charges.

To clean up a dedicated sample deployment, review and remove only its Function
App and resources that are exclusively associated with it, including a dedicated
plan, storage and telemetry resources when no longer needed. Do not delete a
shared plan, storage account, resource group or Application Insights instance.
For an existing shared app, redeploy its reviewed full application without this
sample; do not assume deleting one portal entry safely updates a packaged app.

See [Key Vault references](https://learn.microsoft.com/en-us/azure/app-service/app-service-key-vault-references),
[Functions monitoring](https://learn.microsoft.com/en-us/azure/azure-functions/functions-monitoring),
[package deployment](https://learn.microsoft.com/en-us/azure/azure-functions/deployment-zip-push)
and the [deployment safety guide](../../docs/deployment-safety.md).

## Access and HTTP contract

- `authLevel: 'function'` requires a function/host key in Azure; it is not
  anonymous. Supply the intended function key with the `x-functions-key` header
  via your normal secret manager, not a URL or repository file
- A function key is a shared credential, not user identity or network isolation.
  The endpoint may still be internet-routable. Review Entra ID / App Service
  authentication and network restrictions for production access
- Local Core Tools normally does not enforce function-key authorization. Local
  success does not validate cloud access control
- The catch-all route explicitly registers all nine HTTP methods supported by
  the Node SDK, so method/path decisions reach Almide, including 405 and Allow;
  HEAD omits its body. Omitting the list would default to only GET/POST. Platform
  network layers can still reject methods before the trigger
- `request.text()` preserves text input. No body JSON reserialization occurs
- The configured timeout is 30 seconds. Azure's HTTP response limit is normally
  230 seconds regardless of a longer host timeout; non-HTTP execution limits
  depend on the hosting plan. Payload and platform rejections can occur before
  Almide's smaller shared application-body limit
- Timers, queues, Event Grid and bindings require separate event adapters and
  delivery/retry/idempotency rules; they are not covered by this HTTP example
- The real Azure host, deployment, authentication and networking are untested

A future native route could use a custom handler, but that means an HTTP
process on `FUNCTIONS_CUSTOMHANDLER_PORT` with the Functions host's invocation
protocol. It is additional platform integration, not a bare native executable.

Official sources, checked 2026-10-04:
[Node v4 programming model](https://learn.microsoft.com/en-us/azure/azure-functions/functions-reference-node),
[Node versions and plan restrictions](https://learn.microsoft.com/en-us/azure/azure-functions/functions-versions),
[HTTP trigger, routes and keys](https://learn.microsoft.com/en-us/azure/azure-functions/functions-bindings-http-webhook-trigger),
[hosting limits](https://learn.microsoft.com/en-us/azure/azure-functions/functions-scale),
[custom handlers](https://learn.microsoft.com/en-us/azure/azure-functions/functions-custom-handlers).
