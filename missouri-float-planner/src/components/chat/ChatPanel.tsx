'use client';

// src/components/chat/ChatPanel.tsx
// Chat UI with streaming messages, tool status indicators, and quick actions.

import { useState, useRef, useEffect } from 'react';
import { useChat } from '@/hooks/useChat';
import type { ChatMessage, ToolCallStatus } from '@/lib/chat/types';
import ReactMarkdown from 'react-markdown';
import { Send, Loader2, AlertCircle, Trash2 } from 'lucide-react';
import Image from 'next/image';

interface ChatPanelProps {
  riverSlug?: string;
}

const QUICK_ACTIONS_WITH_RIVER = [
  'Can I float today?',
  'Best section to float?',
  'Nearby camping',
  'What outfitters are available?',
];

const QUICK_ACTIONS_GENERAL = [
  'Which river should I float this weekend?',
  'Best rivers for beginners?',
  'Tell me about the Current River',
  'What are conditions like across the Ozarks?',
];

export default function ChatPanel({ riverSlug }: ChatPanelProps) {
  const { messages, isLoading, error, sendMessage, clearMessages } = useChat({ riverSlug });
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      sendMessage(input);
      setInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const quickActions = riverSlug ? QUICK_ACTIONS_WITH_RIVER : QUICK_ACTIONS_GENERAL;
  const showWelcome = messages.length === 0;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {showWelcome && (
          <div className="text-center py-8">
            <Image
              src="https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_favicon.png"
              alt="Eddy"
              width={64}
              height={64}
              className="mx-auto mb-4 rounded-xl"
            />
            <h2 className="text-lg font-semibold text-neutral-900 mb-1" style={{ fontFamily: 'var(--font-display)' }}>
              Ask Eddy
            </h2>
            <p className="text-sm text-neutral-500 mb-6 max-w-sm mx-auto">
              {riverSlug
                ? 'Ask me anything about floating this river — conditions, trip planning, access points, outfitters.'
                : "I know every creek in the Ozarks. Ask me about conditions, trip planning, or which river to float."}
            </p>

            {/* Quick actions */}
            <div className="flex flex-wrap justify-center gap-2">
              {quickActions.map((action) => (
                <button
                  key={action}
                  onClick={() => sendMessage(action)}
                  className="px-3 py-2 text-sm rounded-full border border-neutral-200 text-neutral-700 hover:bg-neutral-50 hover:border-neutral-300 transition-colors"
                >
                  {action}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {error && (
          <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-neutral-200 px-4 py-3">
        {messages.length > 0 && (
          <div className="flex justify-end mb-2">
            <button
              onClick={clearMessages}
              className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Clear chat
            </button>
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Eddy anything..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-neutral-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-neutral-400"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-colors disabled:opacity-40"
            style={{ backgroundColor: '#163F4A' }}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 text-white animate-spin" />
            ) : (
              <Send className="w-4 h-4 text-white" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Message Bubble ──────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
          isUser
            ? 'bg-neutral-900 text-white'
            : 'bg-neutral-100 text-neutral-900'
        }`}
      >
        {/* Tool status indicators */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-2 space-y-1">
            {message.toolCalls.map((tool, i) => (
              <ToolStatusIndicator key={i} tool={tool} />
            ))}
          </div>
        )}

        {/* Message content */}
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : message.content ? (
          <div className="prose prose-sm prose-neutral max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        ) : message.toolCalls && message.toolCalls.length > 0 ? null : (
          <div className="flex items-center gap-2 text-neutral-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Thinking...</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tool Status Indicator ───────────────────────────────────────────────────

function ToolStatusIndicator({ tool }: { tool: ToolCallStatus }) {
  return (
    <div className="flex items-center gap-2 text-xs text-neutral-500">
      {tool.status === 'calling' ? (
        <Loader2 className="w-3 h-3 animate-spin text-primary-500" />
      ) : tool.status === 'done' ? (
        <svg className="w-3 h-3 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      ) : (
        <AlertCircle className="w-3 h-3 text-red-500" />
      )}
      <span>{tool.label}</span>
    </div>
  );
}
