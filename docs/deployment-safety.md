# Deployment boundaries and safety

This repository prepares code, templates and local tests. It does not create
accounts, log in, deploy services, grant roles, modify networks or incur cloud
costs during its default build/test/package commands. Provider READMEs contain
commands for a human-authorized deployment; reading or validating a template is
not the same as applying it.

## Container versus function routes

Container examples reuse the native Linux executable in the root Dockerfile.
Build a Linux/amd64 image and publish an immutable digest to a registry supported
by the selected provider. Merely building and running the native executable on a
development machine does not validate the Docker image or a cloud deployment.

Function examples reuse `build/app.wasm` with Almide's generated JS host in a
provider-supported Node runtime. They translate provider requests into the same
Almide `handle` call. Platform request parsing, authentication, timeouts, quotas,
logging and response shaping remain provider-specific. Adapter-unit-test parity
does not establish end-to-end platform parity.

## Deliberate access control

The application itself has no authentication. Do not casually make an example
public. Container templates keep internal ingress or private subnets; function
examples use provider IAM or function-key protection. Those settings do not
retroactively remove existing IAM grants, routes, proxies or network access.
Start with new isolated resources or review the actual existing configuration.

No template proves isolation by itself. Confirm who can invoke the deployed
service from both allowed and disallowed clients before using real data. Do not
place credentials, function keys, tokens, project/account IDs tied to secrets,
or deployment parameter files in Git. A provider identity with no application
permissions is preferable while the sample performs no external service calls.

## Health and observations

`GET /health` checks this sample's process and shared handler only; there are no
external dependencies to check. Probe transport, auth and expected response
separately. Fargate task RUNNING is not an HTTP health result, and the shared slim
image does not include curl/wget for a command health check. Native `http.serve`
is sequential, so these examples are not a throughput or concurrency claim.

The sample writes no request-body or secret logs. Platform request/host logs and
container stdout/stderr are separate; consult each provider README for where to
observe them. Keep access-log retention and telemetry costs deliberate.

## Costs and cleanup

An image registry, build service, running service, always-on/minimum instance,
network egress, NAT gateway, private endpoint, load balancer, storage account,
secret store or log retention may incur charges even when no requests arrive.
A zero minimum instance count is not a promise of a zero bill.

Deleting a sample service does not necessarily delete images, logs, revisions,
secrets, storage, networks, identities or retained resources. Provider READMEs
identify the resources they create and what remains. Never delete a shared
cluster, managed environment, VPC, registry, role or storage account merely to
clean up this example. Confirm the target account/subscription/project and the
resource names before every apply or delete command.
