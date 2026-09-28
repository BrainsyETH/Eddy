/** Hosted model evaluation: model-chosen calls, not a scripted tool replay.
 * Run --list without credentials. Other runs require MCP_EVAL_URL, a provider
 * API key and MCP_EVAL_MODEL. See docs/mcp.md. No database writes are made.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { AGENT_TOOLS } from '../src/lib/agent-tools/catalog';
import { hostedEndpoint } from './lib/mcp-eval-config';
import { hostedCalls, reviewDetailFollowups } from './lib/mcp-eval-review';
import { loadEnvLocal } from './lib/db';

interface EvalCase {
  id: string;
  prompt: string;
  expectedTools: string[];
  rubric: string;
}
interface Block {
  type: string;
  id?: string;
  tool_use_id?: string;
  name?: string;
  text?: string;
  input?: unknown;
  arguments?: string;
  output?: string;
  error?: unknown;
  is_error?: boolean;
  content?: Block[] | string;
}
interface ModelResponse {
  content?: Block[];
  output?: Block[];
  usage?: Record<string, unknown>;
  stop_reason?: string;
  status?: string;
}

async function main() {
  const { values } = parseArgs({
    options: {
      list: { type: 'boolean' },
      'allow-provider-bypass': { type: 'boolean', default: false },
      provider: { type: 'string' },
      case: { type: 'string' },
      limit: { type: 'string', default: '20' },
      out: { type: 'string', default: 'tmp/mcp-model-eval.json' },
    },
  });
  const cases: EvalCase[] = JSON.parse(
    readFileSync(resolve('scripts/mcp-eval-cases.json'), 'utf8'),
  );
  if (values.list) {
    console.log(JSON.stringify(cases, null, 2));
    return;
  }
  loadEnvLocal();
  const provider = values.provider;
  if (provider !== 'anthropic' && provider !== 'openai')
    throw new Error('Use --provider anthropic or --provider openai.');
  const keyName =
    provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
  const required = [keyName, 'MCP_EVAL_URL', 'MCP_EVAL_MODEL'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length)
    throw new Error(
      `Missing configuration: ${missing.join(', ')}. Use --list to inspect cases without API calls.`,
    );
  const bypass = process.env.MCP_EVAL_BYPASS_SECRET;
  const endpoint = hostedEndpoint(
    process.env.MCP_EVAL_URL!,
    bypass,
    values['allow-provider-bypass'],
  );
  if (bypass)
    console.warn(
      'The dedicated evaluation bypass credential will be sent to the selected provider. Revoke it after the run.',
    );
  const secrets = [
    process.env[keyName],
    ...endpoint.searchParams.values(),
  ].filter((v): v is string => !!v);
  const redact = (value: string) =>
    secrets.reduce(
      (text, secret) => text.split(secret).join('[redacted]'),
      value,
    );
  const count = Number(values.limit);
  if (!Number.isInteger(count) || count < 1 || count > cases.length)
    throw new Error(`--limit must be 1–${cases.length}.`);
  const selected = (
    values.case ? cases.filter((c) => c.id === values.case) : cases
  ).slice(0, count);
  if (!selected.length) throw new Error('Unknown --case. Use --list for IDs.');
  const now = new Date();
  const system = `You help people plan river trips. Use the connected Eddy tools for live facts. Explain uncertainty and include relevant source links. Today is ${now.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })} in America/Chicago. Keep the answer concise. Use at most eight tool calls.`;
  const allowed = AGENT_TOOLS.map((t) => t.name);
  const rows: Record<string, unknown>[] = [];
  const output = resolve(values.out!);
  mkdirSync(dirname(output), { recursive: true });
  const save = () =>
    writeFileSync(
      output,
      redact(
        JSON.stringify(
          {
            provider,
            model: process.env.MCP_EVAL_MODEL,
            endpoint: `${endpoint.origin}${endpoint.pathname}`,
            startedAt: now.toISOString(),
            note: 'API-hosted MCP evaluation, not a Claude/ChatGPT app connector test. Signals are review aids, not a semantic correctness score. Review each rubric against returned tool data.',
            results: rows,
          },
          null,
          2,
        ),
      ) + '\n',
    );
  for (const c of selected) {
    const started = performance.now();
    try {
      const body =
        provider === 'anthropic'
          ? {
              model: process.env.MCP_EVAL_MODEL,
              max_tokens: 3000,
              system,
              messages: [{ role: 'user', content: c.prompt }],
              mcp_servers: [
                { type: 'url', url: endpoint.toString(), name: 'eddy' },
              ],
              tools: [
                {
                  type: 'mcp_toolset',
                  mcp_server_name: 'eddy',
                  default_config: { enabled: false },
                  configs: Object.fromEntries(
                    allowed.map((name) => [name, { enabled: true }]),
                  ),
                },
              ],
            }
          : {
              model: process.env.MCP_EVAL_MODEL,
              max_output_tokens: 3000,
              store: false,
              instructions: system,
              input: c.prompt,
              tools: [
                {
                  type: 'mcp',
                  server_label: 'eddy',
                  server_url: endpoint.toString(),
                  require_approval: 'never',
                  allowed_tools: allowed,
                },
              ],
            };
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (provider === 'anthropic') {
        headers['x-api-key'] = process.env[keyName]!;
        headers['anthropic-version'] = '2023-06-01';
        headers['anthropic-beta'] = 'mcp-client-2025-11-20';
      } else headers.Authorization = `Bearer ${process.env[keyName]}`;
      const response = await fetch(
        provider === 'anthropic'
          ? 'https://api.anthropic.com/v1/messages'
          : 'https://api.openai.com/v1/responses',
        {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(120_000),
        },
      );
      if (!response.ok)
        throw new Error(
          `Provider HTTP ${response.status}; inspect provider configuration and preview accessibility.`,
        );
      const payload = (await response.json()) as ModelResponse;
      const blocks = payload.content ?? payload.output ?? [];
      const calls = blocks.filter(
        (b) => b.type === 'mcp_tool_use' || b.type === 'mcp_call',
      );
      const toolResults = blocks.filter(
        (b) => b.type === 'mcp_tool_result' || b.type === 'mcp_call',
      );
      const answer = blocks
        .flatMap((b) =>
          b.type === 'text'
            ? [b.text ?? '']
            : b.type === 'message' && Array.isArray(b.content)
              ? b.content
                  .filter((s) => s.type === 'output_text')
                  .map((s) => s.text ?? '')
              : [],
        )
        .join('\n');
      const toolSequence = calls.map((b) => b.name ?? 'unknown');
      rows.push({
        ...c,
        elapsedMs: Math.round(performance.now() - started),
        completion: payload.stop_reason ?? payload.status ?? 'unknown',
        toolSequence,
        toolCalls: calls.length,
        usage: payload.usage ?? null,
        toolResultBytes: Buffer.byteLength(JSON.stringify(toolResults)),
        signals: {
          detailFollowups: reviewDetailFollowups(hostedCalls(blocks), answer),
          expectedToolUsed: c.expectedTools.some((name) =>
            toolSequence.includes(name),
          ),
          withinCallBudget: calls.length <= 8,
          hasEddyLink: /https:\/\/eddy\.guide\//.test(answer),
          mentionsUncertainty:
            /conditional|unavailable|unknown|verify|check|stale|cannot|can't|not a guarantee/i.test(
              answer,
            ),
          toolErrors: toolResults.filter((b) => b.is_error || b.error).length,
        },
        answer,
        trace: blocks.filter(
          (b) =>
            !['thinking', 'redacted_thinking', 'reasoning'].includes(b.type),
        ),
        humanReview: { passed: null, notes: '' },
      });
      console.log(
        `${c.id}: ${calls.length} calls, ${Math.round(performance.now() - started)} ms; review rubric in report`,
      );
    } catch (error) {
      rows.push({
        ...c,
        elapsedMs: Math.round(performance.now() - started),
        error: redact(
          error instanceof Error ? error.message : 'Evaluation failed',
        ),
        humanReview: {
          passed: false,
          notes: 'Request failed before assessment.',
        },
      });
      console.log(`${c.id}: request failed; see report`);
      process.exitCode = 1;
    }
    save();
  }
  console.log(`Saved ${rows.length} evaluation cases to ${output}`);
}

main().catch((error: unknown) => {
  // Configuration errors intentionally contain names, never credential values.
  console.error(
    error instanceof Error ? error.message : 'Evaluation setup failed.',
  );
  process.exitCode = 1;
});
