'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CornerUpLeft, RefreshCw, Send } from 'lucide-react';
import { adminFetch } from '@/hooks/useAdminAuth';
import EmailReplyEditor from './EmailReplyEditor';
import type { FeedbackConversationResponse } from '@/types/api';

export default function FeedbackConversation({ feedbackId, onSent }: { feedbackId: string; onSent?: (sentAt: string) => void }) {
  const [conversation, setConversation] = useState<FeedbackConversationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [html, setHtml] = useState('');
  const [sending, setSending] = useState(false);
  const [draftLocked, setDraftLocked] = useState(false);
  const [historyUnavailable, setHistoryUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const draftId = useRef<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const loadVersion = useRef(0);
  const endpoint = `/api/admin/feedback/${feedbackId}/replies`;

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    try {
      const response = await adminFetch(endpoint);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load conversation.');
      if (mounted.current && version === loadVersion.current) setConversation(data);
      return data as FeedbackConversationResponse;
    } finally {
      if (mounted.current && version === loadVersion.current) setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    mounted.current = true;
    load().catch((err) => { if (mounted.current) setError(err.message); });
    return () => { mounted.current = false; };
  }, [load]);

  const refresh = () => {
    setError(null);
    load().then(() => { if (mounted.current) setHistoryUnavailable(false); })
      .catch((err) => { if (mounted.current) { setError(err.message); setHistoryUnavailable(true); } });
  };
  const send = async (retryId?: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    setDraftLocked(true);
    setError(null);
    setNotice(null);
    const replyId = retryId || (draftId.current ??= crypto.randomUUID());
    let requestRejected = false;
    try {
      const response = await adminFetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replyId, ...(!retryId ? { html } : {}) }),
      });
      const data = await response.json();
      if (!response.ok) {
        requestRejected = response.status >= 400 && response.status < 500;
        throw new Error(data.error || 'Could not confirm sending. Refresh and retry the saved reply.');
      }
      if (mounted.current) {
        setNotice('Reply sent.'); setHtml(''); setComposing(false); setDraftLocked(false); draftId.current = null;
        onSent?.(data.message.sentAt);
      }
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : 'Could not confirm sending.');
    } finally {
      if (mounted.current) {
        try {
          const updated = await load();
          if (mounted.current) setHistoryUnavailable(false);
          // A saved attempt is retried from history using its immutable content.
          if (mounted.current && updated.messages.some((message) => message.id === replyId)) {
            setComposing(false); setHtml(''); setDraftLocked(false); draftId.current = null;
          } else if (mounted.current && requestRejected) {
            setDraftLocked(false); draftId.current = null;
          }
        } catch { if (mounted.current) { setHistoryUnavailable(true); setError('Could not refresh history. Refresh before sending again.'); } }
        if (mounted.current) setSending(false);
      }
      inFlight.current = false;
    }
  };
  const pending = conversation?.messages.some((message) => message.status === 'sending');
  const hasReply = conversation?.messages.some((message) => message.direction === 'outbound' && message.status === 'sent');
  const empty = !html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();

  return <section className="mt-4 border-t border-neutral-700 pt-4" aria-label="Feedback conversation">
    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-medium text-neutral-200">Conversation</h4>
        {hasReply && <span className="rounded bg-green-500/15 px-2 py-0.5 text-xs text-green-400">Replied</span>}
      </div>
      <button type="button" onClick={refresh} disabled={loading || sending} className="flex items-center gap-1 text-xs text-neutral-300 disabled:opacity-50">
        <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />Refresh conversation
      </button>
    </div>
    {loading && !conversation && <p className="text-sm text-neutral-400">Loading conversation…</p>}
    {conversation?.messages.length === 0 && <p className="mb-3 text-sm text-neutral-400">No replies yet. Send a response to start the conversation.</p>}
    <div className="space-y-3">
      {conversation?.messages.map((message) => <article key={message.id} className={`rounded-lg border p-3 ${message.direction === 'outbound' ? 'border-primary-700 bg-primary-900/20' : 'border-neutral-700 bg-neutral-900'}`}>
        <div className="flex flex-wrap justify-between gap-2 text-xs text-neutral-400 mb-2">
          <span className="break-all text-neutral-200">{message.direction === 'outbound' ? 'Eddy' : message.from}</span>
          <span>{new Date(message.sentAt || message.createdAt).toLocaleString()}</span>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm text-neutral-100">{message.text || 'Email content is still being retrieved.'}</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-400">
          <span title={message.status === 'sent' ? 'Accepted by Resend for delivery' : undefined}>
            {message.status === 'sent' ? 'Sent' : message.status === 'failed' ? 'Not sent' : message.status === 'sending' ? 'Sending not yet confirmed' : message.status === 'loading_body' ? 'Retrieving email' : 'Received'}
          </span>
          {message.direction === 'outbound' && message.status !== 'sent' && (
            message.retryUntil && Date.now() < Date.parse(message.retryUntil)
              ? <button type="button" disabled={sending || loading || Boolean(conversation.configurationError)} onClick={() => send(message.id)} className="text-primary-300 disabled:opacity-50">Retry saved reply</button>
              : <span>Check sending status in Resend before sending again.</span>
          )}
        </div>
        {message.error && <p className="mt-2 text-xs text-red-400">{message.error}</p>}
      </article>)}
    </div>
    {error && <p role="alert" className="my-3 text-sm text-red-400">{error}</p>}
    {notice && <p role="status" className="my-3 text-sm text-green-400">{notice}</p>}
    {conversation?.configurationError && <p role="alert" className="my-3 text-sm text-amber-400">{conversation.configurationError}</p>}
    {conversation && !composing && <button type="button" onClick={() => { setComposing(true); setNotice(null); }} disabled={sending || loading || historyUnavailable || pending || Boolean(conversation.configurationError)} className="mt-3 flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-500 disabled:opacity-50">
      <CornerUpLeft className="w-4 h-4" />Reply
    </button>}
    {conversation && composing && <div className="mt-3 rounded-lg border border-neutral-700 bg-neutral-900 p-3">
      <dl className="mb-3 space-y-1 text-xs text-neutral-400 break-all">
        <div><dt className="inline">To: </dt><dd className="inline text-neutral-200">{conversation.to}</dd></div>
        <div><dt className="inline">From: </dt><dd className="inline text-neutral-200">{conversation.from}</dd></div>
        <div><dt className="inline">Subject: </dt><dd className="inline text-neutral-200">{conversation.subject}</dd></div>
      </dl>
      <div inert={sending || draftLocked}><EmailReplyEditor html={html} onChange={setHtml} /></div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => send()} disabled={sending || loading || historyUnavailable || empty || pending || Boolean(conversation.configurationError)} className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-500 disabled:opacity-50"><Send className="w-4 h-4" />{sending ? 'Sending…' : 'Send reply'}</button>
        <button type="button" onClick={() => { setComposing(false); }} disabled={sending} className="rounded-lg bg-neutral-700 px-4 py-2 text-sm text-neutral-200 disabled:opacity-50">Close draft</button>
        <span className="text-xs text-neutral-400">Their reply will appear here. Feedback status stays unchanged.</span>
      </div>
    </div>}
  </section>;
}
