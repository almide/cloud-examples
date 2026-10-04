// Safety/shape assertions, not a provider API validator or deployment proof.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const readJson = async path => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));

test('Cloud Run container keeps IAM, internal ingress and serial request handling', async () => {
  const config = await readJson('providers/google-cloud-run/service.template.yaml');
  assert.equal(config.apiVersion, 'serving.knative.dev/v1');
  assert.equal(config.kind, 'Service');
  assert.equal(config.metadata.annotations['run.googleapis.com/ingress'], 'internal');
  assert.equal(config.metadata.annotations['run.googleapis.com/invoker-iam-disabled'], 'false');
  assert.equal(config.metadata.annotations['run.googleapis.com/minScale'], '0');
  const spec = config.spec.template.spec;
  assert.equal(spec.containerConcurrency, 1);
  assert.equal(spec.serviceAccountName, '__RUNTIME_SERVICE_ACCOUNT__');
  const container = spec.containers[0];
  assert.equal(container.ports[0].containerPort, 8080);
  for (const probe of [container.startupProbe, container.livenessProbe]) {
    assert.equal(probe.httpGet.path, '/health');
    assert.equal(probe.httpGet.port, 8080);
  }
});

test('Cloud Run renderer is local-only and requires an immutable image', () => {
  const env = { ...process.env, SERVICE_NAME: 'almide-test',
    RUNTIME_SERVICE_ACCOUNT: 'almide-test@example-project.iam.gserviceaccount.com',
    IMAGE_DIGEST: `us-central1-docker.pkg.dev/example-project/examples/api@sha256:${'a'.repeat(64)}` };
  const good = spawnSync(process.execPath, ['providers/google-cloud-run/render.mjs'], { env, encoding: 'utf8' });
  assert.equal(good.status, 0, good.stderr);
  assert.equal(JSON.parse(good.stdout).spec.template.spec.containers[0].image, env.IMAGE_DIGEST);
  assert.doesNotMatch(good.stdout, /__[A-Z_]+__/);
  for (const image of ['api:latest', env.IMAGE_DIGEST.replace(/@sha256:.+/, ':latest')]) {
    const bad = spawnSync(process.execPath, ['providers/google-cloud-run/render.mjs'], {
      env: { ...env, IMAGE_DIGEST: image }, encoding: 'utf8',
    });
    assert.notEqual(bad.status, 0);
    assert.match(bad.stderr, /full sha256 digest/);
  }
});

test('Azure Container Apps uses only one private app and existing identity/environment', async () => {
  const config = await readJson('providers/azure-container-apps/main.json');
  assert.equal(config.resources.length, 1);
  const app = config.resources[0];
  assert.equal(app.type, 'Microsoft.App/containerApps');
  assert.equal(app.apiVersion, '2025-07-01');
  assert.equal(app.identity.type, 'UserAssigned');
  const p = app.properties;
  assert.equal(p.environmentId, "[parameters('environmentResourceId')]");
  assert.equal(p.configuration.ingress.external, false);
  assert.equal(p.configuration.ingress.allowInsecure, false);
  assert.equal(p.configuration.ingress.targetPort, 8080);
  assert.equal(p.configuration.identitySettings[0].lifecycle, 'None');
  assert.equal(p.template.scale.minReplicas, 0);
  const container = p.template.containers[0];
  assert.match(container.image, /@sha256:/);
  assert.deepEqual(container.env, [{ name: 'PORT', value: '8080' }]);
  assert.deepEqual(container.probes.map(probe => probe.type).sort(), ['Liveness', 'Readiness', 'Startup']);
  for (const probe of container.probes) assert.deepEqual(probe.httpGet, { path: '/health', port: 8080, scheme: 'HTTP' });
});

test('Fargate creates no public endpoint, IAM role, or broken curl health check', async () => {
  const config = await readJson('providers/aws-ecs-fargate/template.json');
  const resources = config.Resources;
  assert.deepEqual(Object.values(resources).map(r => r.Type).sort(), [
    'AWS::EC2::SecurityGroup', 'AWS::ECS::Service', 'AWS::ECS::TaskDefinition', 'AWS::Logs::LogGroup',
  ]);
  const task = resources.TaskDefinition.Properties;
  assert.equal(task.NetworkMode, 'awsvpc');
  assert.deepEqual(task.RequiresCompatibilities, ['FARGATE']);
  assert.deepEqual(task.RuntimePlatform, { CpuArchitecture: 'X86_64', OperatingSystemFamily: 'LINUX' });
  assert.deepEqual(task.ExecutionRoleArn, { Ref: 'ExecutionRoleArn' });
  assert.equal(task.TaskRoleArn, undefined);
  const container = task.ContainerDefinitions[0];
  assert.deepEqual(container.Environment, [{ Name: 'PORT', Value: '8080' }]);
  assert.equal(container.HealthCheck, undefined); // No client exists in the shared slim image.
  assert.equal(container.ReadonlyRootFilesystem, true);
  assert.equal(container.LogConfiguration.LogDriver, 'awslogs');
  const service = resources.Service.Properties;
  assert.equal(service.NetworkConfiguration.AwsvpcConfiguration.AssignPublicIp, 'DISABLED');
  assert.deepEqual(service.NetworkConfiguration.AwsvpcConfiguration.Subnets, { Ref: 'PrivateSubnetIds' });
  assert.equal(service.LoadBalancers, undefined);
  const ingress = resources.TaskSecurityGroup.Properties.SecurityGroupIngress;
  assert.equal(ingress.length, 1);
  assert.deepEqual(ingress[0].SourceSecurityGroupId, { Ref: 'CallerSecurityGroupId' });
  assert.equal(ingress[0].CidrIp, undefined);
  assert.equal(ingress[0].FromPort, 8080);
  assert.equal(ingress[0].ToPort, 8080);
  const allowedImage = new RegExp(config.Parameters.ImageUri.AllowedPattern);
  assert.ok(allowedImage.test(`123456789012.dkr.ecr.us-east-1.amazonaws.com/api@sha256:${'a'.repeat(64)}`));
  assert.ok(!allowedImage.test('123456789012.dkr.ecr.us-east-1.amazonaws.com/api:latest'));
});

test('Lambda SAM keeps authenticated URL and a Node24 Wasm package', async () => {
  const config = await readJson('providers/aws-lambda/template.yaml');
  assert.equal(config.Transform, 'AWS::Serverless-2016-10-31');
  const fn = config.Resources.ApiFunction.Properties;
  assert.equal(fn.Runtime, 'nodejs24.x');
  assert.equal(fn.Handler, 'providers/aws-lambda/handler.handler');
  assert.equal(fn.CodeUri, '../../build/packages/aws-lambda/');
  assert.equal(fn.FunctionUrlConfig.AuthType, 'AWS_IAM');
  assert.deepEqual(fn.Policies, ['AWSLambdaBasicExecutionRole']);
  assert.equal(Object.values(config.Resources).some(r => r.Type === 'AWS::Lambda::Permission'), false);
});

test('function deployments preserve IAM/key authentication defaults', async () => {
  const google = await readFile(new URL('../providers/google-cloud-functions/deploy.sh', import.meta.url), 'utf8');
  for (const flag of ['--no-allow-unauthenticated', '--invoker-iam-check', '--ingress internal']) {
    assert.ok(google.includes(flag), flag);
  }
  assert.match(google, /--execute/);
  const azure = await readFile(new URL('../providers/azure-functions/registration.mjs', import.meta.url), 'utf8');
  assert.match(azure, /authLevel:\s*'function'/);
  assert.doesNotMatch(azure, /authLevel:\s*'anonymous'/);
  const host = await readJson('providers/azure-functions/host.json');
  assert.equal(host.extensions.http.routePrefix, '');
  assert.equal(host.functionTimeout, '00:00:30');
  for (const name of ['aws-lambda', 'google-cloud-functions', 'azure-functions']) {
    const pkg = await readJson(`providers/${name}/package.json`);
    const lock = await readJson(`providers/${name}/package-lock.json`);
    assert.equal(pkg.engines.node, '24.x');
    assert.equal(pkg.type, 'module');
    assert.deepEqual(pkg.dependencies ?? {}, lock.packages[''].dependencies ?? {});
  }
});


test('ConoHa Terraform admits only operator SSH and keeps state and credentials out of Git', async () => {
  const read = path => readFile(new URL(`../providers/conoha/terraform/${path}`, import.meta.url), 'utf8');
  const main = await read('main.tf');
  const variables = await read('variables.tf');
  const versions = await read('versions.tf');
  assert.match(versions, /source\s*=\s*"gmo-internet\/conohavps"/);
  assert.match(versions, /provider "conohavps" \{\}/, 'credentials come from the environment');
  // Only port 22, only from the given CIDRs, and not ConoHa's world-open SSH group.
  assert.equal(main.match(/resource "conohavps_securitygroup_rule"/g).length, 1);
  assert.match(main, /port_range_min\s*=\s*22\s*\n\s*port_range_max\s*=\s*22/);
  assert.match(main, /remote_ip_prefix\s*=\s*each\.value/);
  assert.match(main, /security_group\s*=\s*\[\{ name = conohavps_securitygroup\.ssh\.name \}\]/);
  assert.doesNotMatch(main, /IPv4v6-SSH|0\.0\.0\.0\/0|::\/0/);
  assert.match(variables, /variable "ssh_allowed_cidrs" \{(?:(?!default\s*=)[\s\S])*?validation/, 'no default CIDR');
  assert.match(variables, /"0\.0\.0\.0\/0", "::\/0"/);
  const gitIgnore = await readFile(new URL('../.gitignore', import.meta.url), 'utf8');
  for (const entry of ['.terraform/', '*.tfstate', '*.tfvars', '!*.tfvars.example']) assert.ok(gitIgnore.includes(entry), entry);
});

test('Google Terraform keeps internal ingress, the invoker check and private buckets', async () => {
  const read = path => readFile(new URL(`../providers/${path}`, import.meta.url), 'utf8');
  const run = await read('google-cloud-run/terraform/main.tf');
  const fn = await read('google-cloud-functions/terraform/main.tf');
  assert.match(run, /ingress\s*=\s*"INGRESS_TRAFFIC_INTERNAL_ONLY"/);
  assert.match(run, /invoker_iam_disabled\s*=\s*false/);
  assert.match(run, /max_instance_request_concurrency\s*=\s*1/);
  assert.match(fn, /ingress_settings\s*=\s*"ALLOW_INTERNAL_ONLY"/);
  for (const main of [run, fn]) {
    assert.doesNotMatch(main, /allUsers|allAuthenticatedUsers|roles\/(owner|editor)/);
    for (const bucket of main.matchAll(/resource "google_storage_bucket" "[a-z_]+" \{[\s\S]*?\n\}/g)) {
      assert.match(bucket[0], /public_access_prevention\s*=\s*"enforced"/);
      assert.match(bucket[0], /uniform_bucket_level_access\s*=\s*true/);
    }
    // The runtime identity gets the bucket role only, never a project role.
    assert.match(main, /resource "google_storage_bucket_iam_member" "runtime_notes"[\s\S]*?role\s*=\s*"roles\/storage\.objectUser"/);
    assert.doesNotMatch(main, /google_project_iam_member"[^{]*\{[^}]*runtime/);
  }
  for (const dir of ['google-cloud-run', 'google-cloud-functions']) {
    assert.match(await read(`${dir}/terraform/variables.tf`), /"allUsers", "allAuthenticatedUsers"/);
  }
});

test('Cloudflare Terraform uploads only the imported Wasm and binds NOTES', async () => {
  const main = await readFile(new URL('../providers/cloudflare-workers/terraform/main.tf', import.meta.url), 'utf8');
  const wrangler = await readFile(new URL('../providers/cloudflare-workers/wrangler.jsonc', import.meta.url), 'utf8');
  assert.match(main, /compatibility_flags = \["nodejs_compat", "new_module_registry"\]/);
  assert.ok(wrangler.includes('"compatibility_flags": ["nodejs_compat", "new_module_registry"]'));
  assert.equal(main.match(/compatibility_date = "([^"]+)"/)[1], wrangler.match(/"compatibility_date": "([^"]+)"/)[1]);
  assert.match(main, /regex\("from \\"\\\\\.\/\(\[0-9a-f\]\+-app\\\\\.wasm\)\\""/);
  assert.match(main, /name\s*=\s*"NOTES"\s*\n\s*type\s*=\s*"kv_namespace"/);
});

test('local credential and tool outputs are excluded from source and Docker context', async () => {
  const gitIgnore = await readFile(new URL('../.gitignore', import.meta.url), 'utf8');
  const dockerIgnore = await readFile(new URL('../.dockerignore', import.meta.url), 'utf8');
  for (const entry of ['.aws-sam/', 'local.settings.json', '.env', '.dev.vars']) assert.ok(gitIgnore.includes(entry), entry);
  for (const entry of ['**/local.settings.json', '**/.aws-sam', '**/.env*', '**/.dev.vars*']) assert.ok(dockerIgnore.includes(entry), entry);
});
