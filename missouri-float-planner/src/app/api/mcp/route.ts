import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { trackedMcp } from '@/lib/telemetry/upstream';
import { logger } from '@/lib/logger';
import { createAgentExecutor } from '@/lib/agent-tools/executor';
import { createAgentServer } from '@/lib/agent-tools/mcp-server';
import { expensiveTool, readMcpBody, validOrigin } from '@/lib/agent-tools/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// MCP stays free. No x402 wrapper; REST billing is a separate interface.
async function handleMcpRequest(req: Request): Promise<Response> {
  if (!validOrigin(req)) return Response.json({ error: 'Origin not allowed' }, { status: 403 });
  const ip = getClientIp(req);
  const limited = await rateLimit(`mcp:${ip}`, 120, 60_000, { failClosed: true, requireGlobalLimiter: true });
  if (limited) return limited;
  let parsedBody: unknown;
  if (req.method === 'POST') {
    try { parsedBody = await readMcpBody(req); }
    catch (error) { return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Expected one JSON-RPC request no larger than 32 KiB.' } }, { status: error instanceof Error && error.message === 'too_large' ? 413 : 400 }); }
    if (expensiveTool(parsedBody)) {
      // One shared allowance across heavy tools, not a fresh budget per name.
      const costly = await rateLimit(`mcp-heavy:${ip}`, 12, 60_000, { failClosed: true, requireGlobalLimiter: true });
      if (costly) return costly;
      const global = await rateLimit('mcp-heavy:global', 120, 60_000, { failClosed: true, requireGlobalLimiter: true });
      if (global) return global;
    }
  }
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  const server = createAgentServer(async (name, args) => createAgentExecutor(await createClient())(name, args), {
    track: (name, run) => trackedMcp(name, run),
    log: event => { if (process.env.MCP_USAGE_LOGGING === 'true') logger.info('[MCP] tool', event); },
  });
  try {
    await server.connect(transport);
    return await transport.handleRequest(req, { parsedBody });
  } finally { await server.close(); }
}
export const GET = handleMcpRequest;
export const POST = handleMcpRequest;
export const DELETE = handleMcpRequest;
