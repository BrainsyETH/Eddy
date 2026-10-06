/** Hosted providers must be explicitly authorized to receive a dedicated
 * evaluation credential. Never inherit Vercel's general automation secret. */
export function hostedEndpoint(
  raw: string,
  dedicatedSecret?: string,
  allowProviderBypass = false,
) {
  const endpoint = new URL(raw);
  if (
    endpoint.protocol !== 'https:' ||
    ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)
  ) {
    throw new Error(
      'Hosted evaluation requires a remotely reachable HTTPS MCP endpoint.',
    );
  }
  if (
    endpoint.search ||
    endpoint.hash ||
    endpoint.username ||
    endpoint.password
  ) {
    throw new Error(
      'Keep credentials and query parameters out of MCP_EVAL_URL.',
    );
  }
  if (dedicatedSecret && !allowProviderBypass) {
    throw new Error(
      'MCP_EVAL_BYPASS_SECRET will be sent to the model provider. Explicitly use --allow-provider-bypass, or use the local SDK evaluator.',
    );
  }
  if (allowProviderBypass && !dedicatedSecret) {
    throw new Error(
      '--allow-provider-bypass requires a dedicated MCP_EVAL_BYPASS_SECRET.',
    );
  }
  if (dedicatedSecret)
    endpoint.searchParams.set('x-vercel-protection-bypass', dedicatedSecret);
  return endpoint;
}
