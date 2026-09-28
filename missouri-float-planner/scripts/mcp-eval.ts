/** Real-model tool-selection evaluation through the MCP SDK. No DB credentials
 * or writes. --check lists readiness; --smoke only calls read-only MCP tools.
 * Model/provider must be selected explicitly; never silently spend on a default.
 */
import { reviewDetailFollowups } from './lib/mcp-eval-review';
import { writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const cases = (
  JSON.parse(readFileSync('scripts/mcp-eval-cases.json', 'utf8')) as Array<{
    id: string;
    prompt: string;
    expectedTools: string[];
    rubric: string;
  }>
).map((c) => [c.id, c.prompt, c.expectedTools, c.rubric] as const);

type Block = { type: string; [key: string]: unknown };
interface ModelResponse {
  content?: Block[];
  output?: Block[];
  usage?: Record<string, number>;
  stop_reason?: string;
  status?: string;
}

async function main() {
  const provider = process.env.MCP_EVAL_PROVIDER;
  const model = process.env.MCP_EVAL_MODEL;
  const key =
    provider === 'anthropic'
      ? process.env.ANTHROPIC_API_KEY
      : process.env.OPENAI_API_KEY;
  const endpoint = process.env.MCP_EVAL_URL;
  const output = process.env.MCP_EVAL_OUTPUT || '/tmp/eddy-mcp-eval.json';
  if (process.argv.includes('--check')) {
    console.log(
      JSON.stringify(
        {
          endpointConfigured: !!endpoint,
          provider,
          modelConfigured: !!model,
          keyConfigured: !!key,
          cases: cases.map(([id, prompt, expectedTools, review]) => ({
            id,
            prompt,
            expectedTools,
            review,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }
  const smoke = process.argv.includes('--smoke');
  if (
    !endpoint ||
    (!smoke &&
      (!model || !key || !['anthropic', 'openai'].includes(provider ?? '')))
  )
    throw new Error(
      'Set MCP_EVAL_URL; model runs also require MCP_EVAL_PROVIDER=anthropic|openai, MCP_EVAL_MODEL, and that provider’s API key. Use --check for readiness.',
    );
  const url = new URL(endpoint);
  if (
    url.protocol !== 'https:' &&
    !(
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1'].includes(url.hostname)
    )
  )
    throw new Error('Use HTTPS except for a local development server.');
  if (url.search || url.username || url.password)
    throw new Error(
      'Keep credentials out of MCP_EVAL_URL; use VERCEL_AUTOMATION_BYPASS_SECRET for the header.',
    );
  const client = new Client({ name: 'eddy-mcp-eval', version: '1.0.0' });
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: {
      headers: bypass ? { 'x-vercel-protection-bypass': bypass } : {},
    },
  });
  const records: unknown[] = [];
  const persist = () =>
    writeFile(
      output,
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          endpoint: `${url.origin}${url.pathname}`,
          mode: smoke ? 'sdk-smoke' : 'model-via-sdk',
          provider,
          model,
          server: client.getServerVersion(),
          records,
          limitation:
            'API model evaluation via an MCP SDK client; does not establish Claude or ChatGPT application connector compatibility. Heuristic checks require human review.',
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
  try {
    await client.connect(transport);
    const catalog = (await client.listTools()).tools;
    const instructions = `${client.getInstructions() ?? ''}\nToday is ${new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })} in America/Chicago. Use Eddy tools for current facts. Explain unavailable information.`;
    if (smoke) {
      const probes = [
        ...['current', 'jacks-fork', 'buffalo'].map((river) => ({
          id: river,
          name: 'find_floats',
          arguments: {
            river,
            targetHours: 3,
            vesselType: 'canoe',
            ...(process.env.MCP_EVAL_DATE
              ? { date: process.env.MCP_EVAL_DATE }
              : {}),
          },
        })),
        {
          id: 'akers-pulltite',
          name: 'plan_float',
          arguments: {
            river: 'current',
            putIn: 'akers-ferry',
            takeOut: 'pulltite-spring',
            vesselType: 'canoe',
            ...(process.env.MCP_EVAL_DATE
              ? { date: process.env.MCP_EVAL_DATE }
              : {}),
          },
        },
      ];
      for (const probe of probes) {
        const started = performance.now();
        const result = await client.callTool({
          name: probe.name,
          arguments: probe.arguments,
        });
        records.push({
          case: probe.id,
          elapsedMs: Math.round(performance.now() - started),
          bytes: Buffer.byteLength(JSON.stringify(result.structuredContent)),
          result: result.structuredContent,
          isError: result.isError,
        });
        await persist();
        console.log(
          `${probe.id}: completed in ${Math.round(performance.now() - started)} ms`,
        );
      }
      return;
    }
    for (const [id, prompt, expectedTools, review] of cases) {
      if (process.env.MCP_EVAL_CASE && process.env.MCP_EVAL_CASE !== id)
        continue;
      const started = performance.now();
      const history: unknown[] = [{ role: 'user', content: prompt }];
      const calls: Array<{
        tool: string;
        arguments: unknown;
        elapsedMs: number;
        bytes: number;
        isError: boolean;
        result: unknown;
      }> = [];
      const usage: Record<string, number> = {};
      let answer = '',
        exhausted = true,
        error: string | null = null;
      try {
        for (let round = 0; round < 8 && calls.length < 12; round++) {
          const anthropic = provider === 'anthropic';
          const response = await fetch(
            anthropic
              ? 'https://api.anthropic.com/v1/messages'
              : 'https://api.openai.com/v1/responses',
            {
              method: 'POST',
              signal: AbortSignal.timeout(60_000),
              headers: anthropic
                ? {
                    'Content-Type': 'application/json',
                    'x-api-key': key!,
                    'anthropic-version': '2023-06-01',
                  }
                : {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${key}`,
                  },
              body: JSON.stringify(
                anthropic
                  ? {
                      model,
                      max_tokens: 4096,
                      system: instructions,
                      messages: history,
                      tools: catalog.map((t) => ({
                        name: t.name,
                        description: t.description,
                        input_schema: t.inputSchema,
                      })),
                    }
                  : {
                      model,
                      instructions,
                      input: history,
                      max_output_tokens: 4096,
                      store: false,
                      include: ['reasoning.encrypted_content'],
                      parallel_tool_calls: false,
                      tools: catalog.map((t) => ({
                        type: 'function',
                        name: t.name,
                        description: t.description,
                        parameters: t.inputSchema,
                        strict: false,
                      })),
                    },
              ),
            },
          );
          if (!response.ok)
            throw new Error(`Model API HTTP ${response.status}`);
          const responseData = (await response.json()) as ModelResponse;
          for (const [name, count] of Object.entries(responseData.usage ?? {}))
            if (typeof count === 'number')
              usage[name] = (usage[name] ?? 0) + count;
          const blocks = anthropic
            ? (responseData.content ?? [])
            : (responseData.output ?? []);
          if (anthropic) history.push({ role: 'assistant', content: blocks });
          else history.push(...blocks);
          const requested = blocks.filter(
            (b) => b.type === (anthropic ? 'tool_use' : 'function_call'),
          );
          if (!requested.length) {
            answer = anthropic
              ? blocks
                  .filter((b) => b.type === 'text')
                  .map((b) => String(b.text))
                  .join('\n')
              : blocks
                  .filter((b) => b.type === 'message')
                  .flatMap((b) =>
                    (b.content as Block[])
                      .filter((c) => c.type === 'output_text')
                      .map((c) => String(c.text)),
                  )
                  .join('\n');
            exhausted =
              responseData.stop_reason === 'max_tokens' ||
              responseData.status === 'incomplete';
            break;
          }
          const responses: unknown[] = [];
          for (const call of requested) {
            if (calls.length >= 12) throw new Error('Tool-call budget reached');
            const name = String(call.name);
            if (!catalog.some((t) => t.name === name))
              throw new Error('Model requested an unknown tool');
            const args = anthropic
              ? call.input
              : JSON.parse(String(call.arguments));
            const toolStarted = performance.now();
            const result = await client.callTool({
              name,
              arguments: args as Record<string, unknown>,
            });
            const payload = result.structuredContent ?? result.content;
            const text = JSON.stringify(payload);
            calls.push({
              tool: name,
              arguments: args,
              elapsedMs: Math.round(performance.now() - toolStarted),
              bytes: Buffer.byteLength(text),
              isError: !!result.isError,
              result: payload,
            });
            responses.push(
              anthropic
                ? {
                    type: 'tool_result',
                    tool_use_id: call.id,
                    content: text,
                    is_error: !!result.isError,
                  }
                : {
                    type: 'function_call_output',
                    call_id: call.call_id,
                    output: text,
                  },
            );
          }
          if (anthropic) history.push({ role: 'user', content: responses });
          else history.push(...responses);
        }
      } catch (e) {
        error = e instanceof Error ? e.message : 'Evaluation failed';
      }
      if (error || exhausted) process.exitCode = 1;
      records.push({
        id,
        prompt,
        review,
        calls,
        toolSequence: calls.map((c) => c.tool),
        usage,
        elapsedMs: Math.round(performance.now() - started),
        answer,
        exhausted,
        error,
        checks: {
          detailFollowups: reviewDetailFollowups(calls, answer),
          expectedToolUsed: calls.some((c) =>
            (expectedTools as readonly string[]).includes(c.tool),
          ),
          eddyLinkPresent: /https:\/\/eddy\.guide\//.test(answer),
          caveatLanguagePresent:
            /unavailable|unknown|conditional|verify|check|cannot|can't|current conditions/i.test(
              answer,
            ),
          humanReviewRequired: true,
        },
      });
      await persist();
      console.log(
        JSON.stringify({ case: id, calls: calls.length, error, exhausted }),
      );
    }
  } finally {
    await client.close();
  }
  console.log(`Evaluation saved to ${output}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Evaluation failed');
  process.exitCode = 1;
});
