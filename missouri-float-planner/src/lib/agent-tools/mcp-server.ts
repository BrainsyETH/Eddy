import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AGENT_TOOLS, AGENT_INSTRUCTIONS } from './catalog';
import { AGENT_VERSION, result, type AgentResult } from './contracts';

export type Executor = (name: string, input: unknown) => Promise<AgentResult>;
export function createAgentServer(execute: Executor, hooks: {
  track?: <T>(name: string, run: () => Promise<T>) => Promise<T>;
  log?: (event: { tool: string; client: string; durationMs: number; status: string }) => void;
} = {}) {
  const server = new McpServer({ name: 'eddy-guide', version: AGENT_VERSION }, { instructions: AGENT_INSTRUCTIONS });
  for (const tool of AGENT_TOOLS) {
    server.registerTool(tool.name, {
      title: tool.title, description: tool.description, inputSchema: tool.input.shape, outputSchema: tool.output.shape,
      annotations: { title: tool.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      _meta: { securitySchemes: [{ type: 'noauth' }] },
    }, async (args) => {
      const run = async () => {
        const started = performance.now();
        let response: AgentResult;
        try { response = await execute(tool.name, args); }
        catch { response = result({ message: 'Tool lookup failed. Please retry.' }, 'lookup_failed'); }
        // Stateless HTTP commonly does not carry initialize clientInfo into a
        // tools/call request. Never invent a user identity from an IP/UA.
        const reported = server.server.getClientVersion()?.name;
        const client = reported && /^[a-zA-Z0-9 ._-]{1,60}$/.test(reported) ? reported : 'not_reported';
        try { hooks.log?.({ tool: tool.name, client, durationMs: Math.round(performance.now() - started), status: response.status }); } catch { /* telemetry must not break tools */ }
        return { content: [{ type: 'text' as const, text: JSON.stringify(response) }], structuredContent: response, isError: ['lookup_failed', 'invalid_request', 'rate_limited'].includes(response.status) };
      };
      return hooks.track ? hooks.track(tool.name, run) : run();
    });
  }
  return server;
}
