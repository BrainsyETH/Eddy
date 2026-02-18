// src/components/chat/ChatPanel.tsx
// Eddy AI chat panel — floating button + expandable chat drawer

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { MessageCircle, X, Send, Trash2, Loader2 } from 'lucide-react';
import { useChat, type ChatMessage } from '@/hooks/useChat';

interface ChatPanelProps {
  riverSlug?: string;
  riverName?: string;
}

const QUICK_ACTIONS = [
  'Which rivers are running well?',
  'Plan a float trip',
  'Check conditions',
];

function ChatMessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  if (message.isLoading) {
    return (
      <div className="flex justify-start">
        <div className="bg-blue-50 text-blue-900 rounded-2xl rounded-bl-md px-4 py-3 max-w-[85%]">
          <div className="flex items-center gap-2 text-sm text-blue-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Eddy is thinking...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`rounded-2xl px-4 py-2.5 max-w-[85%] text-sm leading-relaxed ${
          isUser
            ? 'bg-blue-600 text-white rounded-br-md'
            : 'bg-blue-50 text-blue-900 rounded-bl-md'
        }`}
      >
        {isUser ? (
          <p>{message.content}</p>
        ) : (
          <div
            className="prose prose-sm prose-blue max-w-none [&_p]:my-1 [&_ul]:my-1 [&_li]:my-0.5 [&_strong]:text-blue-900"
            dangerouslySetInnerHTML={{
              __html: formatMarkdown(message.content),
            }}
          />
        )}
      </div>
    </div>
  );
}

// Simple markdown to HTML for chat messages
function formatMarkdown(text: string): string {
  return text
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Bullet lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    // Line breaks (double newline = paragraph, single = <br>)
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    // Wrap in paragraph if not already
    .replace(/^(?!<)/, '<p>')
    .replace(/(?!>)$/, '</p>')
    // Clean up empty tags
    .replace(/<p><\/p>/g, '')
    .replace(/<p><ul>/g, '<ul>')
    .replace(/<\/ul><\/p>/g, '</ul>');
}

export default function ChatPanel({ riverSlug, riverName }: ChatPanelProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { messages, isLoading, sendMessage, clearMessages } = useChat({
    riverSlug,
    riverName,
  });

  // Hide chat on embeddable widget pages
  if (pathname.startsWith('/embed/widget') || pathname.startsWith('/embed/planner')) return null;

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSend = useCallback(() => {
    if (!input.trim() || isLoading) return;
    sendMessage(input);
    setInput('');
  }, [input, isLoading, sendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleQuickAction = useCallback((action: string) => {
    sendMessage(action);
  }, [sendMessage]);

  return (
    <>
      {/* Floating Action Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center group"
          aria-label="Open Eddy AI assistant"
        >
          <MessageCircle className="w-6 h-6" />
          {/* Pulse indicator */}
          {messages.length === 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-white animate-pulse" />
          )}
        </button>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-0 right-0 sm:bottom-6 sm:right-6 z-50 w-full sm:w-[400px] h-[100dvh] sm:h-[600px] sm:max-h-[80vh] bg-white sm:rounded-2xl shadow-2xl border border-neutral-200 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-blue-600 text-white sm:rounded-t-2xl">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-sm font-bold">
                E
              </div>
              <div>
                <h3 className="text-sm font-semibold">Eddy</h3>
                <p className="text-xs text-blue-200">Float trip assistant</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  onClick={clearMessages}
                  className="p-2 hover:bg-blue-500 rounded-lg transition-colors"
                  title="Clear chat"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-blue-500 rounded-lg transition-colors"
                aria-label="Close chat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-100 flex items-center justify-center">
                  <span className="text-2xl">🦦</span>
                </div>
                <h4 className="text-sm font-semibold text-neutral-800 mb-1">
                  Hey there! I&apos;m Eddy.
                </h4>
                <p className="text-xs text-neutral-500 mb-6 max-w-[250px] mx-auto">
                  I can help you check river conditions, plan float trips, and find the best put-ins on 8 Missouri rivers.
                </p>

                {/* Quick Actions */}
                <div className="space-y-2">
                  {QUICK_ACTIONS.map((action) => (
                    <button
                      key={action}
                      onClick={() => handleQuickAction(action)}
                      className="block w-full text-left px-4 py-2.5 bg-neutral-50 hover:bg-blue-50 text-sm text-neutral-700 hover:text-blue-700 rounded-xl border border-neutral-200 hover:border-blue-200 transition-colors"
                    >
                      {action}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <ChatMessageBubble key={msg.id} message={msg} />
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t border-neutral-200 px-4 py-3">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about rivers, conditions, trips..."
                className="flex-1 text-sm bg-neutral-100 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
                disabled={isLoading}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="w-10 h-10 bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-300 text-white rounded-xl flex items-center justify-center transition-colors"
                aria-label="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
