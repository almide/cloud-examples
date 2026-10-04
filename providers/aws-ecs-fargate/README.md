# AWS ECS Fargate: private native container

Status: template JSON and local safety assertions checked; AWS contracts reviewed
against official documentation on **2026-10-04**. No Docker build/run, AWS template
validation, image push, provisioning or live endpoint test has been performed for
this provider. This is a deployment candidate, not a hosted-support claim.

[template.json](template.json) runs the root [Dockerfile](../../Dockerfile) without
changing the shared application: `GET /health` and `POST /greet` on `PORT=8080`.
Almide's native `http.serve` handles requests **sequentially per task**. This is a
small compatibility example, not a throughput, high-availability or security
benchmark. The app has no authentication or TLS.

## What it creates, and what must already exist

The stack creates one Linux/x86_64 Fargate service/task (0.25 vCPU, 512 MiB), one
task definition, one security group and a seven-day CloudWatch log group. It uses
`awsvpc` networking and Linux platform `1.4.0`. Its non-root container has a
read-only root filesystem. There is no public IP, load balancer, DNS name, service
discovery, autoscaling or application task role.

Supply these **existing**, reviewed resources in the same AWS account and Region:

- An ECS cluster and the [ECS service-linked role][service-role] `AWSServiceRoleForECS`. Have an
  administrator verify the role already exists; ECS may otherwise try to create
  it. The template does not create or modify IAM roles/policies.
- A VPC, private IPv4 subnets, and an existing caller security group in that VPC.
  The caller must already have private routing and permission to send TCP 8080.
  Prefer subnets in two Availability Zones, though one running task is not HA.
- An ECS **task execution role** trusted by `ecs-tasks.amazonaws.com`, with ECR
  image-pull and CloudWatch log-stream/write permissions. Scope the log permissions
  to `/almide/<stack-name>` and its streams where practical. The log group is
  created by CloudFormation, so the task does not need `logs:CreateLogGroup`.
- An ECR private repository with the reviewed image in the same account/Region.
  The parameter accepts an immutable `repository@sha256:...` URI, not a tag.
- AWS CLI v2, authorized credentials, and an authorized deployment principal with
  permissions for these resources and `iam:PassRole` for the execution role.
  Existing cluster defaults/organizational policies must permit this example.

The new task security group accepts **only TCP 8080 from members of the specified
caller security group**. Every resource using that caller group gains network
access, so do not choose a broad shared group accidentally. Group membership is
network filtering, not per-user authentication. Subnet and security-group
parameter types do not prove the supplied subnets are private or in the same VPC;
verify those relationships yourself.

Outbound TCP 443 is allowed to IPv4 destinations. This is deliberately broader
than fixed AWS endpoint addresses; it does not grant Internet ingress. The sample
does not add NAT, endpoints, routes, caller rules or endpoint security-group rules.
Review narrower egress for your environment before production use.

### Private image and logging connectivity

Without a public IP, task startup needs an existing NAT route to AWS APIs **or**
private endpoints. For private ECR with Fargate 1.4.0, the endpoint route requires
`ecr.api` and `ecr.dkr` interface endpoints, an S3 gateway endpoint for image
layers, and a `logs` interface endpoint for `awslogs`. Enable the required private
DNS, associate S3 routes with the task subnets, and allow HTTPS from the task
security group on interface-endpoint security groups. Endpoint policies, network
ACLs and DNS must permit these operations. Custom DNS may need additional reviewed
rules; the sample assumes Amazon-provided VPC DNS. A security-group reference by
itself does not supply a route. See the [ECR endpoint requirements][ecr-endpoints]
and [Fargate networking guide][networking].

## Build and publish an amd64 image

The compiler's pinned source build is substantially heavier than this tiny
runtime. Use a suitable build machine and the root prerequisites. On ARM hosts,
`--platform linux/amd64` requires a correctly configured builder/emulation; merely
tagging an ARM binary does not make it x86_64. Do not switch the task to ARM64
without separately building and testing that architecture.

Run from the repository root. Replace all example values. The registry hostname
below uses the commercial AWS partition; use its documented hostname if deploying
elsewhere.

```sh
export AWS_REGION=us-east-1
export AWS_ACCOUNT_ID=123456789012
export ECR_REPOSITORY=almide-example
export IMAGE_TAG=reviewed-build-001
export ECR_REGISTRY="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
export TAGGED_IMAGE="$ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG"

docker build --platform linux/amd64 -t "$TAGGED_IMAGE" .
docker image inspect "$TAGGED_IMAGE" --format '{{.Os}}/{{.Architecture}}'
# Must report linux/amd64. Optional local smoke test:
docker run --rm --name almide-fargate-local -d --read-only \
  -p 127.0.0.1:8080:8080 "$TAGGED_IMAGE"
curl --fail --max-time 10 --retry 10 --retry-connrefused --retry-delay 1 \
  http://127.0.0.1:8080/health
curl --fail --max-time 10 http://127.0.0.1:8080/greet \
  -H 'content-type: application/json' --data '{"name":"Almide"}'
docker stop almide-fargate-local
```

Publishing uploads your image and incurs registry storage charges. Authenticate
with your approved [ECR authentication workflow][ecr-auth] first; Docker login can
save registry authentication in your local credential store/configuration. Do not
put credentials in this repository. Then, only when authorized to publish:

```sh
docker push "$TAGGED_IMAGE"
DIGEST=$(aws ecr describe-images --region "$AWS_REGION" \
  --repository-name "$ECR_REPOSITORY" --image-ids imageTag="$IMAGE_TAG" \
  --query 'imageDetails[0].imageDigest' --output text)
export IMAGE_URI="$ECR_REGISTRY/$ECR_REPOSITORY@$DIGEST"
printf '%s\n' "$IMAGE_URI"
```

Check that the digest identifies the image you just reviewed. The [ECS container
definition][container] accepts digest references. The root base-image tags are not
digest-locked, so rebuilding the same source is not a fully hermetic build.

## Review and deploy deliberately

Local JSON parsing does not contact AWS or validate AWS permissions/networking:

```sh
node -e 'JSON.parse(require("node:fs").readFileSync("providers/aws-ecs-fargate/template.json", "utf8")); console.log("JSON parsed")'
# Optional, if cfn-lint is already installed: local schema/rule validation
cfn-lint providers/aws-ecs-fargate/template.json
```

The commands below contact AWS. `deploy` creates billable resources and the task
security group described above. Run them only after reviewing the template,
permissions, network access, charges and deletion behavior. No IAM capability flag
is needed because the template has no IAM resources.

```sh
export STACK_NAME=almide-private-example
export CLUSTER_ARN=arn:aws:ecs:us-east-1:123456789012:cluster/existing-cluster
export VPC_ID=vpc-0123456789abcdef0
export PRIVATE_SUBNET_IDS=subnet-0123456789abcdef0,subnet-0fedcba9876543210
export CALLER_SECURITY_GROUP_ID=sg-0123456789abcdef0
export EXECUTION_ROLE_ARN=arn:aws:iam::123456789012:role/existing-ecs-execution-role

aws cloudformation validate-template --region "$AWS_REGION" \
  --template-body file://providers/aws-ecs-fargate/template.json
aws cloudformation deploy --region "$AWS_REGION" --stack-name "$STACK_NAME" \
  --template-file providers/aws-ecs-fargate/template.json \
  --parameter-overrides \
    ClusterArn="$CLUSTER_ARN" VpcId="$VPC_ID" \
    PrivateSubnetIds="$PRIVATE_SUBNET_IDS" \
    CallerSecurityGroupId="$CALLER_SECURITY_GROUP_ID" \
    ExecutionRoleArn="$EXECUTION_ROLE_ARN" ImageUri="$IMAGE_URI"
```

`validate-template` is not a deployment or a guarantee of runtime success. For a
reviewable change set without execution, add `--no-execute-changeset` to `deploy`;
this still creates AWS control-plane state. Template updates that change the image
digest register a new task revision and roll the service. The 100% minimum / 200%
maximum policy can temporarily run two paid tasks. Circuit-breaker rollback needs
a previous successful deployment; first-deployment failures have no previous app
revision to restore. Consult [service deployment settings][deployment].

## Health and a private smoke test

The shared Debian slim runtime does **not** install curl or wget and the app has
no command-line health-check mode. ECS container `HealthCheck` commands execute
inside that runtime, so copying a `CMD-SHELL curl ...` example would fail. The
template intentionally has no container health command and no load balancer.
`RUNNING`, service stability and circuit-breaker success therefore do **not** prove
that `/health` responds; task health can be `UNKNOWN`. See [ECS health checks][health].

An independently reviewed extension could add an **internal** ALB with an `ip`
target group, HTTP port 8080 and `GET /health` expecting status 200. ALB probes run
outside the container and need no curl in the image. The service must be attached
to that target group (`app`, port 8080), with ALB-to-task security-group access.
That adds networking, resources and cost and is intentionally outside this
template. See [ALB integration][alb]. A real in-container probe would instead
require a tested probe executable baked into a separately reviewed image.

After deployment, locate the task's **private** address with these read-only AWS
calls. Re-discover it after each restart/update; it is not a stable service URL.

```sh
SERVICE_NAME=$(aws cloudformation describe-stacks --region "$AWS_REGION" \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='ServiceName'].OutputValue | [0]" --output text)
aws ecs wait services-stable --region "$AWS_REGION" \
  --cluster "$CLUSTER_ARN" --services "$SERVICE_NAME"
TASK_ARN=$(aws ecs list-tasks --region "$AWS_REGION" --cluster "$CLUSTER_ARN" \
  --service-name "$SERVICE_NAME" --desired-status RUNNING \
  --query 'taskArns[0]' --output text)
TASK_IP=$(aws ecs describe-tasks --region "$AWS_REGION" --cluster "$CLUSTER_ARN" \
  --tasks "$TASK_ARN" \
  --query 'tasks[0].containers[0].networkInterfaces[0].privateIpv4Address' --output text)
printf 'Private task address: %s\n' "$TASK_IP"
```

Check that neither result is `None`/empty; inspect service events if no task exists.
From an **already authorized host or task with the caller security group**, private
routing to the task, and curl installed on that caller (not inside this image):

```sh
# Set TASK_IP to the current private address returned above on this caller.
curl --fail --max-time 10 "http://$TASK_IP:8080/health"
curl --fail --max-time 10 "http://$TASK_IP:8080/greet" \
  -H 'content-type: application/json' --data '{"name":"Almide"}'
```

Expect `{"ok":true}` and `{"message":"Hello, Almide!"}`. An ordinary laptop or
default CloudShell session is not automatically in your VPC/caller security group.
Do not open a public port to make the smoke test pass. ECS Exec is disabled here
and is not a test prerequisite.

## Configuration, IAM and logs

`Environment` supplies ordinary values such as `PORT`. Do not store secret values
in that array, the template, parameters, image layers or committed env files.
For a future app that consumes secrets, ECS `Secrets` entries use `Name` plus a
`ValueFrom` Secrets Manager or SSM parameter ARN. The **execution role** needs
scoped `secretsmanager:GetSecretValue` or `ssm:GetParameters`, and `kms:Decrypt`
when a customer-managed key requires it; private connectivity to those services
is also needed. These permissions are not added here. Injected secrets are loaded
when the task starts; rotation requires new tasks and does not refresh a running
process. Environment secrets remain readable to the process and can leak through
diagnostics. See [secret injection][secrets] and [execution-role permissions][execution].

The **task role** supplies AWS permissions to application code at runtime, whereas
the execution role lets ECS fetch images/secrets and deliver logs. This app calls
no AWS APIs, so `TaskRoleArn` is omitted; adding secret injection alone does not
justify an application task role. See [task IAM roles][task-role]. No cloud SDK or
AWS access keys are embedded in the application.

`awslogs` sends application stdout/stderr to `/almide/<stack-name>`, with stream
prefix `app`. The app does not emit access logs for every successful request, so
an empty stream is not evidence of failure. Explicit non-blocking mode uses a
1 MiB buffer and can drop logs if delivery falls behind; review this tradeoff
before relying on logs for audit. The [logging configuration][logging] is separate
from HTTP health. For authorized diagnostics:

```sh
aws ecs describe-services --region "$AWS_REGION" --cluster "$CLUSTER_ARN" \
  --services "$SERVICE_NAME" --query 'services[0].events[:10]'
aws logs tail "/almide/$STACK_NAME" --region "$AWS_REGION" --since 10m
```

For image-pull/startup failures, inspect stopped-task reasons and the execution
role, digest/architecture, available subnet IPs, DNS, endpoint/NAT paths and log
permissions before changing ingress. A successful local native test is not proof
that the container or these AWS paths work.

## Costs and complete cleanup

One task stays running even when idle; this service does not scale to zero.
Fargate CPU/memory usage, ECR storage, CloudWatch ingestion/storage, network
transfer, and any existing NAT gateways/interface endpoints can incur charges.
Rolling deployment can temporarily double task usage. Check the current
[Fargate pricing][pricing] and your Region's dependent-service pricing.

**Deleting the stack stops the service and deletes its task security group and
log group, including all stored logs.** Logs also expire after seven days while
the stack exists. Export any needed diagnostics first. Only after approving that
loss and confirming the stack name:

```sh
aws cloudformation delete-stack --region "$AWS_REGION" --stack-name "$STACK_NAME"
aws cloudformation wait stack-delete-complete --region "$AWS_REGION" \
  --stack-name "$STACK_NAME"
```

Verify task ENIs are released and no service tasks remain; a failed deletion can
leave chargeable resources and needs inspection. Task-definition revision records
may remain inactive; review them separately if cleanup of metadata is required.
Never remove definitions still used by another service or task. See [task-definition
states][task-states] and [CloudFormation deletion policy][deletion].

The existing cluster, VPC, subnets, roles, caller security group, NAT/endpoints and
**pushed ECR images/repository are not deleted** by this stack. Remove only the
test image/digest through your approved repository cleanup process after checking
for other consumers; retained images and network infrastructure can keep costing
money. Remove local test containers/images if desired. If you logged Docker in
specifically for this test, use `docker logout "$ECR_REGISTRY"` when appropriate.
Do not delete shared infrastructure to clean up this example.

## Official contracts reviewed

- [CloudFormation ECS task definition][task-definition], [runtime platform][platform],
  [container properties][container] and [Fargate platform versions][versions]
- [CloudFormation ECS service][service], [VPC configuration][vpc-config],
  [security group][security-group] and [log group][log-group]

[task-definition]: https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-ecs-taskdefinition.html
[platform]: https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-ecs-taskdefinition-runtimeplatform.html
[container]: https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-ecs-taskdefinition-containerdefinition.html
[versions]: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/platform-fargate.html
[service]: https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-ecs-service.html
[vpc-config]: https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-ecs-service-awsvpcconfiguration.html
[security-group]: https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-ec2-securitygroup.html
[log-group]: https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-logs-loggroup.html
[ecr-endpoints]: https://docs.aws.amazon.com/AmazonECR/latest/userguide/vpc-endpoints.html
[networking]: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-task-networking.html
[ecr-auth]: https://docs.aws.amazon.com/AmazonECR/latest/userguide/registry_auth.html
[deployment]: https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-ecs-service-deploymentconfiguration.html
[health]: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/healthcheck.html
[alb]: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/alb.html
[secrets]: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/secrets-envvar-secrets-manager.html
[execution]: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_execution_IAM_role.html
[service-role]: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/using-service-linked-roles-for-clusters.html
[task-role]: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html
[logging]: https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-ecs-taskdefinition-logconfiguration.html
[pricing]: https://aws.amazon.com/fargate/pricing/
[task-states]: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-definition-state.html
[deletion]: https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-attribute-deletionpolicy.html
