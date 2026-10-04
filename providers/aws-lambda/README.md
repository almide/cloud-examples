# AWS Lambda: Wasm in Node.js 24

The adapter reuses the generated Almide JS host and Wasm. There is no custom
Wasm ABI, native bootstrap, listening HTTP server, or AWS SDK dependency.

## Local preparation

From the repository root, after the normal compiler build:

```sh
node scripts/package-faas.mjs aws-lambda
node --test tests/faas.test.mjs
```

The source package in `build/packages/aws-lambda/` preserves the `providers/`,
`adapters/`, and `build/` layout. The managed runtime handler setting is
`providers/aws-lambda/handler.handler`. Node.js loads `handler.mjs` as ESM.

## Optional cloud deployment

The supplied `template.yaml` is JSON-compatible AWS SAM YAML. It declares Node
24, a 30-second timeout, 256 MiB memory, two reserved concurrent executions, and
a buffered Function URL with `AWS_IAM` authentication. The URL remains
internet-routable, but unsigned/unauthorized callers cannot invoke it.

These are **unexecuted deployment instructions**. They upload code and create
billable resources, an IAM execution role with basic logging permissions, and
a Function URL. Review the generated change set and your AWS account/region
before allowing deployment; this example has not been deployed to AWS.

```sh
sam build --template-file providers/aws-lambda/template.yaml
sam deploy --guided --template-file .aws-sam/build/template.yaml
```

SAM's guided deployment asks about IAM role creation. This repository does not
run it or grant caller access automatically. Grant only the intended caller
the necessary `lambda:InvokeFunctionUrl` and `lambda:InvokeFunction` permissions
for the resulting function, and sign requests with SigV4. The function's
execution role is distinct from the caller's identity.

To delete a stack you created, review and run `sam delete --stack-name NAME`
for that exact stack. Resources retained by your policies can need separate
cleanup. Reserved concurrency is not a spending cap.

## Configuration, secrets and logs

`/notes` has no store on this route: the adapter passes none, so `/notes`
answers 503 `storage_unavailable` (tested). A store would be a host-side
`{ get, put }` passed to `callApi`, as Cloud Run functions does with Cloud Storage.


Environment variables configured on Lambda are visible to the Node host through
`process.env`. The current shared `callApi` boundary passes only method, target
and body; it does not import host environment values into Wasm. There are no
application secrets in this example. A future Secrets Manager integration must
be explicit host-side code with narrowly scoped execution-role access; never
put secret literals in the SAM template, package, logs or test fixtures.

The supplied basic execution role allows CloudWatch logging. Lambda normally
creates `/aws/lambda/<function-name>` on first invocation; stdout/stderr and
platform diagnostics can appear there. This sample adds no request-body or
secret logging. Automatically created log groups default to indefinite
retention, and this template does not manage their lifecycle. After deleting
the sample stack, check for its retained log group, deployment artifacts and
any other retained resources; review retention or delete only resources that
belong exclusively to this sample. CloudWatch storage and deployment artifact
storage can continue to cost money after the function is removed.

See [Lambda log groups](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-cloudwatchlogs-loggroups.html),
[log retention](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/Working-with-log-groups-and-streams.html)
and the repository's [deployment safety guide](../../docs/deployment-safety.md).

## Contract and limitations

- Only HTTP payload version 2.0 is supported (Function URL / API Gateway HTTP
  API). API Gateway REST/v1, queue, storage, and scheduler events are rejected
- Raw path/query and UTF-8 body are mapped to the shared API. Base64 request
  bodies are decoded. Request headers/cookies are unused by this sample API
- JSON is encoded once; status, Content-Type and Allow are preserved. HEAD
  responses omit the body
- The shared host initializes Wasm once and reuses it for warm calls. This does
  not promise process persistence or a cold-start latency figure
- Lambda's general limit is 15 minutes and 6 MB for buffered synchronous
  request/response payloads; this example deliberately configures 30 seconds
  and has a much smaller shared application-body limit. HTTP frontends can add
  tighter constraints
- Unit tests invoke the real Wasm through a simulated Lambda HTTP envelope.
  They do not test AWS authorization, networking, deployment, or the managed
  runtime. There is no cloud verification yet

A later native variant could use `provided.al2023`, but it must implement a
`bootstrap` executable and the Lambda Runtime API request/response/error loop.
A container image alone does not remove that Lambda invocation contract.

Official sources, checked 2026-10-04:
[Node handler](https://docs.aws.amazon.com/lambda/latest/dg/nodejs-handler.html),
[runtimes](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html),
[Function URL envelope](https://docs.aws.amazon.com/lambda/latest/dg/urls-invocation.html),
[caller authorization](https://docs.aws.amazon.com/lambda/latest/dg/urls-auth.html),
[limits](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html),
[custom runtime](https://docs.aws.amazon.com/lambda/latest/dg/runtimes-custom.html).
