// src/app/api/chat/route.ts
// POST /api/chat — Streaming chat endpoint for Eddy.
// Accepts messages + optional river context, streams SSE responses with tool calling.

import Anthropic from '@anthropic-ai/sdk';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { EDDY_TOOLS } from '@/lib/chat/tools';
import { executeToolCall } from '@/lib/chat/tool-handlers';
import { STATIC_SYSTEM_PROMPT, buildDynamicContext } from '@/lib/chat/system-prompt';
import { TOOL_LABELS } from '@/lib/chat/types';
import { createAdminClient } from '@/lib/supabase/admin';
import { withX402Route } from '@/lib/x402-config';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60s for multi-tool conversations

interface ChatRequestBody {
  messages: { role: 'user' | 'assistant'; content: string }[];
  riverSlug?: string;
}

async function _POST(request: Request) {
  // Chat feature is currently disabled while we optimize the experience
  return new Response(
    JSON.stringify({ error: 'Chat is temporarily unavailable. Check back soon.' }),
    { status: 503, headers: { 'Content-Type': 'application/json' } }
  );

  // Rate limit: 30 messages per hour per IP
  const ip = getClientIp(request);
  const rateLimitResult = rateLimit(`chat:${ip}`, 30, 60 * 60 * 1000);
  if (rateLimitResult) return rateLimitResult;

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return new Response(
      JSON.stringify({ error: 'Chat service not configured' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body: ChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid request body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!body.messages || body.messages.length === 0) {
    return new Response(
      JSON.stringify({ error: 'Messages array is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Truncate to last 10 user/assistant messages for cost control
  const recentMessages = body.messages.slice(-10);

  const client = new Anthropic({ apiKey: anthropicKey });
  const dynamicContext = buildDynamicContext(body.riverSlug);

  // Track for logging
  const startTime = Date.now();
  const toolsCalled: string[] = [];
  let fullResponse = '';
  let inputTokens = 0;
  let outputTokens = 0;

  // Create SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Build the messages array for Anthropic API
        // Convert simple string messages to Anthropic format
        let anthropicMessages: Anthropic.MessageParam[] = recentMessages.map(m => ({
          role: m.role,
          content: m.content,
        }));

        // Tool calling loop — keep going until Claude stops calling tools
        const MAX_TOOL_ITERATIONS = 5;
        let iterations = 0;
        let continueLoop = true;
        while (continueLoop && iterations < MAX_TOOL_ITERATIONS) {
          iterations++;
          const response = await client.messages.create({
            model: process.env.CHAT_MODEL || 'claude-sonnet-4-5-20250929',
            max_tokens: 2048,
            system: [
              {
                type: 'text',
                text: STATIC_SYSTEM_PROMPT,
                cache_control: { type: 'ephemeral' },
              },
              {
                type: 'text',
                text: dynamicContext,
              },
            ],
            tools: EDDY_TOOLS,
            messages: anthropicMessages,
          });

          // Track token usage
          inputTokens += response.usage?.input_tokens || 0;
          outputTokens += response.usage?.output_tokens || 0;

          // Check stop reason to decide whether to stream text to the user.
          // If stop_reason is 'tool_use', any text in this turn is intermediate
          // thinking/narration — discard it. Only stream text on the final turn.
          const isFinalTurn = response.stop_reason === 'end_turn';

          // Process response content blocks
          // Collect all tool results so we can send them together in one user message
          const toolResults: Anthropic.ToolResultBlockParam[] = [];

          for (const block of response.content) {
            if (block.type === 'text') {
              fullResponse += block.text;
              // Only send text to client on the final turn (no intermediate narration)
              if (isFinalTurn) {
                send({ type: 'text', content: block.text });
              }
            } else if (block.type === 'tool_use') {
              const toolName = block.name;
              const toolLabel = TOOL_LABELS[toolName] || `Using ${toolName}...`;
              toolsCalled.push(toolName);

              send({ type: 'tool_start', tool: toolName, label: toolLabel });

              // Execute the tool
              let toolResult: unknown;
              try {
                toolResult = await executeToolCall(toolName, block.input as Record<string, unknown>);
              } catch (e) {
                console.error(`[Chat] Tool ${toolName} failed:`, e);
                toolResult = { error: `Tool failed: ${e instanceof Error ? e.message : 'unknown error'}` };
              }

              send({ type: 'tool_end', tool: toolName });

              // Send structured data for rich card rendering
              if (toolResult && typeof toolResult === 'object' && !('error' in (toolResult as Record<string, unknown>))) {
                send({ type: 'tool_data', tool: toolName, data: toolResult as Record<string, unknown> });
              }

              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify(toolResult),
              });
            }
          }

          // Append assistant message + all tool results together
          // Each tool_use in the assistant message must have a matching tool_result
          if (toolResults.length > 0) {
            anthropicMessages = [
              ...anthropicMessages,
              { role: 'assistant', content: response.content },
              { role: 'user', content: toolResults },
            ];
          }

          // Continue loop only if Claude wants to use more tools
          continueLoop = !isFinalTurn && response.stop_reason === 'tool_use';
        }

        if (iterations >= MAX_TOOL_ITERATIONS && continueLoop) {
          console.warn(`[Chat] Hit max tool iterations (${MAX_TOOL_ITERATIONS}), ending loop`);
          send({ type: 'text', content: 'I checked several sources but need to wrap up. Let me know if you need more details on anything specific.' });
        }

        send({ type: 'done' });
      } catch (e) {
        console.error('[Chat] Stream error:', e);
        send({
          type: 'error',
          message: e instanceof Error ? e.message : 'An error occurred',
        });
      } finally {
        controller.close();

        // Log asynchronously — don't block the response
        logChatInteraction({
          sessionId: request.headers.get('x-session-id') || 'unknown',
          riverSlug: body.riverSlug || null,
          userMessage: recentMessages[recentMessages.length - 1]?.content || '',
          assistantResponse: fullResponse,
          toolsCalled,
          inputTokens,
          outputTokens,
          durationMs: Date.now() - startTime,
          ipHash: hashIp(ip),
        }).catch(e => console.error('[Chat] Logging failed:', e));
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// ─── Logging ─────────────────────────────────────────────────────────────────

async function logChatInteraction(data: {
  sessionId: string;
  riverSlug: string | null;
  userMessage: string;
  assistantResponse: string;
  toolsCalled: string[];
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  ipHash: string;
}) {
  try {
    const supabase = createAdminClient();
    await supabase.from('chat_logs').insert({
      session_id: data.sessionId,
      river_slug: data.riverSlug,
      user_message: data.userMessage.slice(0, 2000),
      assistant_response: data.assistantResponse.slice(0, 5000),
      tools_called: data.toolsCalled,
      input_tokens: data.inputTokens,
      output_tokens: data.outputTokens,
      duration_ms: data.durationMs,
      ip_hash: data.ipHash,
    });
  } catch (e) {
    console.error('[Chat] Failed to log interaction:', e);
  }
}

function hashIp(ip: string): string {
  // Simple hash for privacy — not cryptographically secure, just for analytics grouping
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    const char = ip.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

export const POST = withX402Route(_POST as unknown as (request: import('next/server').NextRequest) => Promise<import('next/server').NextResponse>, '$0.02', 'AI chat access');
