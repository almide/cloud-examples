import { handler } from './handler.mjs';

// Separate, inspectable registration contract. The SDK defaults omitted methods
// to GET/POST, so list all its supported methods to let Almide own 405 + Allow.
export const registration = {
  route: '{*path}',
  authLevel: 'function',
  methods: ['GET', 'POST', 'DELETE', 'HEAD', 'PATCH', 'PUT', 'OPTIONS', 'TRACE', 'CONNECT'],
  handler,
};
