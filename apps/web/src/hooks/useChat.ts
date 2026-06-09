// src/hooks/useChat.ts
// React hook for streaming chat with Eddy via SSE.

'use client';

import { useState, useCallback, useRef } from 'react';
import type { ChatMessage, ToolCallStatus, ToolResultData, SSEEvent } from '@/lib/chat/types';
import { TOOL_LABELS } from '@/lib/chat/types';

interface UseChatOptions {
  riverSlug?: string;
}

interface UseChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (content: string) => void;
  clearMessages: () => void;
}

let messageCounter = 0;
function generateId(): string {
  return `msg_${Date.now()}_${++messageCounter}`;
}

// Generate a stable session ID per browser tab
const SESSION_ID = typeof window !== 'undefined'
  ? `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  : 'ssr';

export function useChat({ riverSlug }: UseChatOptions = {}): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    setError(null);

    // Add user message
    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: content.trim(),
      timestamp: Date.now(),
    };

    // Create placeholder assistant message
    const assistantMessage: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: '',
      toolCalls: [],
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setIsLoading(true);

    // Build message history for API (last 10 messages, text only)
    const apiMessages = [...messages, userMessage]
      .slice(-10)
      .map(m => ({ role: m.role, content: m.content }));

    // Abort previous request if still running
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': SESSION_ID,
        },
        body: JSON.stringify({
          messages: apiMessages,
          riverSlug,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      // Read SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE events
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          try {
            const event: SSEEvent = JSON.parse(line.slice(6));

            switch (event.type) {
              case 'text':
                setMessages(prev => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last && last.role === 'assistant') {
                    updated[updated.length - 1] = {
                      ...last,
                      content: last.content + (event.content || ''),
                    };
                  }
                  return updated;
                });
                break;

              case 'tool_start':
                setMessages(prev => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last && last.role === 'assistant') {
                    const existing = last.toolCalls || [];
                    // Deduplicate: if same label already exists, increment count
                    const label = event.label || 'Working...';
                    const existingIdx = existing.findIndex(tc => tc.label === label);
                    let newToolCalls: ToolCallStatus[];
                    if (existingIdx >= 0) {
                      newToolCalls = existing.map((tc, i) =>
                        i === existingIdx ? { ...tc, count: (tc.count || 1) + 1, status: 'calling' as const } : tc
                      );
                    } else {
                      newToolCalls = [...existing, {
                        name: event.tool || '',
                        label,
                        status: 'calling' as const,
                        count: 1,
                      }];
                    }
                    updated[updated.length - 1] = { ...last, toolCalls: newToolCalls };
                  }
                  return updated;
                });
                break;

              case 'tool_end':
                setMessages(prev => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last && last.role === 'assistant' && last.toolCalls) {
                    const label = TOOL_LABELS[event.tool || ''] || '';
                    const toolCalls = last.toolCalls.map(tc => {
                      // Match by name or label
                      if (tc.name === event.tool || tc.label === label) {
                        const doneCount = (tc.doneCount || 0) + 1;
                        const total = tc.count || 1;
                        return { ...tc, doneCount, status: (doneCount >= total ? 'done' : 'calling') as 'done' | 'calling' };
                      }
                      return tc;
                    });
                    updated[updated.length - 1] = { ...last, toolCalls };
                  }
                  return updated;
                });
                break;

              case 'tool_data':
                setMessages(prev => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last && last.role === 'assistant') {
                    const entry: ToolResultData = {
                      tool: event.tool || '',
                      data: event.data || {},
                    };
                    updated[updated.length - 1] = {
                      ...last,
                      toolData: [...(last.toolData || []), entry],
                    };
                  }
                  return updated;
                });
                break;

              case 'error':
                setError(event.message || 'An error occurred');
                break;

              case 'done':
                // Stream complete
                break;
            }
          } catch {
            // Skip malformed SSE lines
          }
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;

      const errorMessage = e instanceof Error ? e.message : 'Failed to send message';
      setError(errorMessage);

      // Remove the empty assistant message on error
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === 'assistant' && !last.content) {
          updated.pop();
        }
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  }, [messages, isLoading, riverSlug]);

  const clearMessages = useCallback(() => {
    abortControllerRef.current?.abort();
    setMessages([]);
    setError(null);
    setIsLoading(false);
  }, []);

  return { messages, isLoading, error, sendMessage, clearMessages };
}
