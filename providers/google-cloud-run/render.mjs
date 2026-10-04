// Local-only renderer: no cloud SDK, child process, credentials, or network.
import { readFileSync } from 'node:fs';

function required(name, pattern, description) {
  const value = process.env[name];
  if (!value || !pattern.test(value)) {
    throw new Error(`${name} must be ${description}`);
  }
  return value;
}

const serviceName = required(
  'SERVICE_NAME', /^[a-z](?:[a-z0-9-]{0,47}[a-z0-9])?$/,
  'a lowercase Cloud Run service name of 1–49 characters',
);
const runtimeServiceAccount = required(
  'RUNTIME_SERVICE_ACCOUNT', /^[a-z][a-z0-9-]*@[a-z][a-z0-9-]*\.iam\.gserviceaccount\.com$/,
  'an existing user-managed service-account email',
);
const imageDigest = required(
  'IMAGE_DIGEST', /^[a-z0-9-]+-docker\.pkg\.dev\/[a-z0-9-]+\/[a-z0-9._-]+\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/,
  'an Artifact Registry image reference pinned to a full sha256 digest',
);

const service = JSON.parse(readFileSync(new URL('./service.template.yaml', import.meta.url), 'utf8'));
service.metadata.name = serviceName;
service.spec.template.spec.serviceAccountName = runtimeServiceAccount;
service.spec.template.spec.containers[0].image = imageDigest;
// Optional: the bucket /notes is stored in. Without it, /notes answers 503.
const bucket = process.env.GCS_BUCKET;
if (bucket) {
  if (!/^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error('GCS_BUCKET must be a bucket name');
  service.spec.template.spec.containers[0].env = [{ name: 'GCS_BUCKET', value: bucket }];
}
const output = JSON.stringify(service, null, 2);
if (/__[A-Z_]+__/.test(output)) throw new Error('Unresolved template placeholder');
process.stdout.write(`${output}\n`);
