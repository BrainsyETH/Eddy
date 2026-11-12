'use client';
// src/components/admin/ReplyComposer.tsx
// In-app email reply composer shared by the Inbox's email and feedback views:
// quick-reply templates, rich text, send state. The caller owns the request.

import { useState } from 'react';
import { CheckCircle, Send } from 'lucide-react';
import RichTextEditor from '@/components/admin/RichTextEditor';
import { useUnsavedAdminChanges } from '@/components/admin/AdminInteractionProvider';
import { REPLY_TEMPLATES } from '@/lib/email/reply-templates';

/** True when rich-text HTML has no visible content (e.g. an empty "<p></p>"). */
export function isHtmlEmpty(html: string): boolean {
  return !html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

interface Props {
  to: string;
  from: string;
  subject: string;
  /** Sends the reply; resolve with an optional warning, reject with an Error. */
  onSend: (html: string) => Promise<{ warning?: string | null } | void>;
  onClose: () => void;
}

export default function ReplyComposer({ to, from, subject, onSend, onClose }: Props) {
  const [html, setHtml] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ warning: string | null } | null>(null);
  useUnsavedAdminChanges(!sent && !isHtmlEmpty(html));

  const send = async () => {
    if (isHtmlEmpty(html)) return;
    setSending(true);
    setError(null);
    try {
      const result = await onSend(html);
      setSent({ warning: (result && result.warning) || null });
      setHtml('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reply');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-3 bg-neutral-900 border border-neutral-700 rounded-lg p-3">
      {sent ? (
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm">
            <span className="flex items-center gap-2 text-green-400">
              <CheckCircle className="w-4 h-4" />
              Reply sent from {from}.
            </span>
            {sent.warning && <p className="text-yellow-400 text-xs mt-1">{sent.warning}</p>}
          </div>
          <button onClick={onClose} className="px-3 py-1.5 rounded text-xs font-medium admin-secondary">
            Close
          </button>
        </div>
      ) : (
        <>
          <div className="text-xs text-neutral-400 mb-2 space-y-0.5">
            <div>
              <span className="text-neutral-500">To:</span> {to}
            </div>
            <div>
              <span className="text-neutral-500">From:</span> {from}
            </div>
            <div>
              <span className="text-neutral-500">Subject:</span> {subject}
            </div>
          </div>
          <div className="mb-2 flex items-center gap-2">
            <label className="text-xs text-neutral-500" htmlFor="reply-template">
              Template:
            </label>
            <select
              id="reply-template"
              value=""
              onChange={(e) => {
                const tpl = REPLY_TEMPLATES.find((t) => t.id === e.target.value);
                if (tpl) setHtml(tpl.html);
                e.target.value = '';
              }}
              className="px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded-lg text-xs text-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Insert a quick reply…</option>
              {REPLY_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id} title={t.description}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <RichTextEditor content={html} onChange={setHtml} minHeight="150px" placeholder="Write your reply…" />
          {error && (
            <div role="alert" className="text-red-400 text-xs mt-2">
              {error}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <button
              onClick={() => void send()}
              disabled={sending || isHtmlEmpty(html)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-primary-600 text-white hover:bg-primary-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? (
                <div className="w-4 h-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {sending ? 'Sending…' : 'Send reply'}
            </button>
            <button
              onClick={onClose}
              disabled={sending}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 admin-secondary"
            >
              Cancel
            </button>
            <span className="text-xs text-neutral-500 ml-auto hidden sm:inline">Sends from eddy.guide via Resend</span>
          </div>
        </>
      )}
    </div>
  );
}
