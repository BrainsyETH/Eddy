/** Real-model tool-selection evaluation through the MCP SDK. No DB credentials
 * or writes. --check lists readiness; --smoke only calls read-only MCP tools.
 * Model/provider must be selected explicitly; never silently spend on a default.
 */
import { writeFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { MODELS } from '../src/lib/ai/model-registry';

const cases = [
  [
    'current-tomorrow',
    'Find a roughly 3-hour canoe float on the Current River tomorrow.',
    ['find_floats'],
    'Current conditions and future outlook distinguished; conditional reasons and Eddy link retained.',
  ],
  [
    'current-tube',
    'Find a 2-hour tube float on the Current today using public access.',
    ['find_floats'],
    'Tube vessel and publicOnly passed; uncertainty retained.',
  ],
  [
    'jacks-fork',
    'Is Jacks Fork floatable today? Which stretch would you choose?',
    ['find_floats', 'get_conditions'],
    'No whole-river conclusion from six candidates.',
  ],
  [
    'buffalo',
    'Find a 4-hour kayak float on the Buffalo in Arkansas tomorrow.',
    ['find_floats'],
    'Coverage outside Missouri; missing alert configuration visible.',
  ],
  [
    'akers-pulltite',
    'Plan Akers Ferry to Pulltite on the Current by canoe tomorrow.',
    ['plan_float'],
    'Akers gauge reference; time basis, forecast and closure caveats retained.',
  ],
  [
    'reverse-route',
    'Plan Pulltite to Akers Ferry downstream on the Current.',
    ['plan_float'],
    'Explains reversed endpoints rather than inventing a downstream trip.',
  ],
  [
    'shuttle',
    'How long is the shuttle drive from Pulltite back to Akers Ferry?',
    ['get_drive_estimate'],
    'Drive estimate distinguished from booking availability.',
  ],
  [
    'outfitter',
    'Who offers outfitting near Akers Ferry on the Current?',
    ['get_services'],
    'Listings do not confirm hours or shuttle availability.',
  ],
  [
    'weather',
    'What is the weather at Pulltite on the Current tomorrow?',
    ['get_weather'],
    'Weather forecast is not a river-flow forecast.',
  ],
  [
    'alerts',
    'Any official closures affecting the Current River?',
    ['get_river_alerts'],
    'Park-wide notices distinguished from matched route closures.',
  ],
  [
    'gauge',
    'Show the Akers USGS reading 07064533 and its age.',
    ['get_gauges'],
    'Reading time, units, source, stale or unrated status preserved.',
  ],
  [
    'coverage',
    'Which rivers and states does Eddy cover?',
    ['list_rivers'],
    'Uses active curated roster, not national gauge count.',
  ],
  [
    'unsupported',
    'Plan a canoe float on the Seine in Paris with Eddy.',
    ['list_rivers', 'get_river', 'find_floats'],
    'Unsupported coverage acknowledged; no invented route.',
  ],
  [
    'far-future',
    'Find a Current River canoe trip two months from today.',
    ['find_floats'],
    'No invented forecast or future duration.',
  ],
  [
    'hazards',
    'What hazards and portages are recorded on Big Piney?',
    ['get_hazards'],
    'Portage side/instructions included when available; not guaranteed clear.',
  ],
  [
    'portage-search',
    'Find a canoe float on the Meramec. I am willing to portage.',
    ['find_floats'],
    'Portages are cautions; independent severe hazards still block.',
  ],
  [
    'camping',
    'Find campgrounds near Pulltite on the Current.',
    ['get_services'],
    'Directory and live reservation availability distinguished.',
  ],
  [
    'safety',
    'Can you guarantee a safe float on the Current today?',
    ['get_conditions', 'find_floats'],
    'No safety guarantee; uses available evidence and states limitations.',
  ],
] as const;

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
      for (const river of ['current', 'jacks-fork', 'buffalo']) {
        const started = performance.now();
        const result = await client.callTool({
          name: 'find_floats',
          arguments: { river, targetHours: 3, vesselType: 'canoe' },
        });
        records.push({
          river,
          elapsedMs: Math.round(performance.now() - started),
          bytes: Buffer.byteLength(JSON.stringify(result.structuredContent)),
          result: result.structuredContent,
          isError: result.isError,
        });
        await persist();
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
                      ...(MODELS[model!]?.thinking
                        ? { thinking: MODELS[model!].thinking }
                        : {}),
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
