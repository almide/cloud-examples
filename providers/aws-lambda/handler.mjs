import { callApi } from '../../adapters/node-wasm.mjs';

// HTTP payload v2 only: Lambda Function URLs and API Gateway HTTP APIs.
// SQS, S3, EventBridge, and API Gateway REST/v1 events need separate adapters.
export async function handler(event) {
  const method = event?.requestContext?.http?.method;
  if (event?.version !== '2.0' || typeof method !== 'string' || typeof event.rawPath !== 'string') {
    throw new TypeError('Expected an HTTP payload v2.0 event');
  }
  const target = event.rawPath + (event.rawQueryString ? `?${event.rawQueryString}` : '');
  const body = event.body == null ? '' : event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  const result = await callApi(method, target, body);
  return {
    statusCode: result.status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(result.allow ? { allow: result.allow } : {}),
    },
    body: method === 'HEAD' ? '' : JSON.stringify(result.body),
    isBase64Encoded: false,
  };
}
