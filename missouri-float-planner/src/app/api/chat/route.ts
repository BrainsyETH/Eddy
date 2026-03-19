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

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60s for multi-tool conversations

interface ChatRequestBody {
  messages: { role: 'user' | 'assistant'; content: string }[];
  riverSlug?: string;
}

export async function POST(request: Request) {
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
        let continueLoop = true;
        while (continueLoop) {
          const response = await client.messages.create({
            model: 'claude-haiku-4-5-20251001',
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

          // Process response content blocks
          for (const block of response.content) {
            if (block.type === 'text') {
              fullResponse += block.text;
              send({ type: 'text', content: block.text });
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

              // Add the assistant's response (with tool_use) and tool result to messages
              // so Claude can continue with the tool results
              anthropicMessages = [
                ...anthropicMessages,
                { role: 'assistant', content: response.content },
                {
                  role: 'user',
                  content: [{
                    type: 'tool_result',
                    tool_use_id: block.id,
                    content: JSON.stringify(toolResult),
                  }],
                },
              ];
            }
          }

          // Check if we should continue the loop
          if (response.stop_reason === 'end_turn') {
            continueLoop = false;
          } else if (response.stop_reason === 'tool_use') {
            // Claude wants to use tools — continue the loop
            continueLoop = true;
          } else {
            continueLoop = false;
          }
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
