'use client';

// src/components/chat/ChatPanel.tsx
// Branded chat UI with streaming messages, tool status indicators, rich markdown,
// and quick actions. Used inside ChatBubble (widget) and /chat (full page).

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { useChat } from '@/hooks/useChat';
import type { ChatMessage, ToolCallStatus } from '@/lib/chat/types';
import ReactMarkdown from 'react-markdown';
import { Send, Loader2, AlertCircle, Trash2, ExternalLink } from 'lucide-react';
import Image from 'next/image';
import { EDDY_IMAGES } from '@/constants';

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
    <div className="flex flex-col h-full bg-neutral-50">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {showWelcome && (
          <div className="text-center py-6">
            <Image
              src={EDDY_IMAGES.canoe}
              alt="Eddy"
              width={80}
              height={80}
              className="mx-auto mb-3 rounded-2xl shadow-md"
            />
            <h2
              className="text-lg font-bold text-primary-800 mb-1"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {riverSlug ? `Let\u2019s talk ${riverSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}` : "Hey, I\u2019m Eddy"}
            </h2>
            <p className="text-sm text-neutral-500 mb-5 max-w-[260px] mx-auto leading-relaxed">
              {riverSlug
                ? 'Conditions, trip planning, access points, outfitters \u2014 ask me anything.'
                : "I know every creek in the Ozarks. Ask me about conditions or which river to float."}
            </p>

            {/* Quick action pills */}
            <div className="flex flex-wrap justify-center gap-2">
              {quickActions.map((action) => (
                <button
                  key={action}
                  onClick={() => sendMessage(action)}
                  className="px-3 py-1.5 text-sm rounded-full border-2 border-primary-200 text-primary-700 bg-white hover:bg-primary-50 hover:border-primary-300 transition-colors font-medium shadow-sm"
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
          <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2 border border-red-200">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-neutral-200 bg-white px-4 py-3">
        {messages.length > 0 && (
          <div className="flex justify-end mb-2">
            <button
              onClick={clearMessages}
              className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Clear
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
            className="flex-1 resize-none rounded-xl border-2 border-neutral-200 px-4 py-2.5 text-sm bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent focus:bg-white placeholder:text-neutral-400 transition-colors"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center bg-accent-500 hover:bg-accent-600 transition-colors disabled:opacity-40 shadow-sm"
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
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start gap-2'}`}>
      {/* Eddy avatar for assistant messages */}
      {!isUser && (
        <Image
          src={EDDY_IMAGES.canoe}
          alt=""
          width={28}
          height={28}
          className="w-7 h-7 rounded-full flex-shrink-0 mt-1 border border-primary-200"
        />
      )}

      <div
        className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm ${
          isUser
            ? 'bg-primary-800 text-white rounded-br-md'
            : 'bg-white text-neutral-900 border border-neutral-200 shadow-sm rounded-bl-md'
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
          <div className="prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 prose-p:text-neutral-800 prose-p:leading-relaxed prose-headings:text-primary-800 prose-strong:text-primary-900 prose-a:text-primary-600 prose-a:font-medium prose-a:no-underline hover:prose-a:underline prose-li:text-neutral-700">
            <ReactMarkdown
              components={{
                a: ({ href, children }) => <RichLink href={href}>{children}</RichLink>,
              }}
            >
              {message.content}
            </ReactMarkdown>
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

// ─── Rich Link ──────────────────────────────────────────────────────────────

function RichLink({ href, children }: { href?: string; children: ReactNode }) {
  if (!href) return <>{children}</>;

  const isExternal = href.startsWith('http');
  const isUsgs = href.includes('waterdata.usgs.gov');

  return (
    <a
      href={href}
      target={isExternal ? '_blank' : undefined}
      rel={isExternal ? 'noopener noreferrer' : undefined}
      className="inline-flex items-center gap-1 text-primary-600 font-medium hover:text-primary-800 hover:underline transition-colors"
    >
      {children}
      {isExternal && <ExternalLink className="w-3 h-3 inline flex-shrink-0" />}
      {isUsgs && <span className="text-[10px] text-primary-400 font-normal ml-0.5">USGS</span>}
    </a>
  );
}

// ─── Tool Status Indicator ───────────────────────────────────────────────────

function ToolStatusIndicator({ tool }: { tool: ToolCallStatus }) {
  return (
    <div className="flex items-center gap-2 text-xs text-neutral-500">
      {tool.status === 'calling' ? (
        <Loader2 className="w-3 h-3 animate-spin text-accent-500" />
      ) : tool.status === 'done' ? (
        <svg className="w-3 h-3 text-support-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      ) : (
        <AlertCircle className="w-3 h-3 text-red-500" />
      )}
      <span>{tool.label}</span>
    </div>
  );
}
