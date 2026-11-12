'use client';
import { useAdminInteractions } from '@/components/admin/AdminInteractionProvider';

// src/components/admin/InboundEmailList.tsx
// Admin view for mail received at *@eddy.guide (Resend inbound webhook).
// Rendered inside the Feedback admin page as a sub-tab.

import { useEffect, useState, useCallback } from 'react';
import { adminFetch } from '@/hooks/useAdminAuth';
import {
  Mail,
  MailOpen,
  Clock,
  Paperclip,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Archive,
  Ban,
  Inbox,
  CornerUpLeft,
} from 'lucide-react';
import type { InboundEmail, InboundEmailStatus } from '@/types/api';
import ReplyComposer from '@/components/admin/ReplyComposer';
import ListPager from '@/components/admin/ListPager';

const EDDY_DOMAIN = 'eddy.guide';
const PAGE_SIZE = 50;

/** Best-effort client-side guess of the From address (server decides for real). */
function replyFromDisplay(email: InboundEmail): string {
  const found = [...email.receivedFor, ...email.toAddresses].find((a) =>
    a?.toLowerCase().includes(`@${EDDY_DOMAIN}`),
  );
  return found ? found.match(new RegExp(`[^\\s<>"]+@${EDDY_DOMAIN}`, 'i'))?.[0] || found : `an @${EDDY_DOMAIN} address`;
}

function replySubjectDisplay(subject: string | null): string {
  const base = (subject || '').trim();
  if (!base) return 'Re:';
  return /^re:/i.test(base) ? base : `Re: ${base}`;
}

const FILTER_OPTIONS: { value: InboundEmailStatus | 'all'; label: string }[] = [
  { value: 'unread', label: 'Unread' },
  { value: 'read', label: 'Read' },
  { value: 'archived', label: 'Archived' },
  { value: 'spam', label: 'Spam' },
  { value: 'all', label: 'All' },
];

const STATUS_BADGE: Record<InboundEmailStatus, { label: string; color: string }> = {
  unread: { label: 'Unread', color: 'bg-blue-500' },
  read: { label: 'Read', color: 'bg-neutral-500' },
  archived: { label: 'Archived', color: 'bg-neutral-600' },
  spam: { label: 'Spam', color: 'bg-red-500' },
};

// Explicit triage actions offered on each message.
const ACTIONS: { value: InboundEmailStatus; label: string; icon: typeof Archive }[] = [
  { value: 'read', label: 'Read', icon: MailOpen },
  { value: 'unread', label: 'Unread', icon: Mail },
  { value: 'archived', label: 'Archive', icon: Archive },
  { value: 'spam', label: 'Spam', icon: Ban },
];

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

interface Props {
  /** Reports the current global unread count so the parent tab badge stays live. */
  onUnreadChange?: (unread: number) => void;
}

export default function InboundEmailList({ onUnreadChange }: Props) {
  const { alert } = useAdminInteractions();
  const [emails, setEmails] = useState<InboundEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<InboundEmailStatus | 'all'>('unread');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  // Bulk selection is scoped to the rows on screen and cleared when they change.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);

  // Reply composer: one open at a time.
  const [replyingId, setReplyingId] = useState<string | null>(null);

  const reportUnread = useCallback(
    (n: number) => {
      onUnreadChange?.(n);
    },
    [onUnreadChange],
  );

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String((page - 1) * PAGE_SIZE));
      if (search) params.set('q', search);

      const response = await adminFetch(`/api/admin/inbound-emails?${params.toString()}`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to fetch email');
      }
      const data = await response.json();
      setEmails(data.emails);
      setTotal(data.total ?? 0);
      reportUnread(data.unread ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch email');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page, search, reportUnread]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  useEffect(() => {
    setSelected(new Set());
  }, [statusFilter, page, search]);

  // Search as you type, without a request per keystroke.
  useEffect(() => {
    const next = searchInput.trim();
    if (next === search) return;
    const timer = setTimeout(() => {
      setSearch(next);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, search]);

  const visibleSelected = emails.filter((e) => selected.has(e.id)).map((e) => e.id);
  const allSelected = emails.length > 0 && visibleSelected.length === emails.length;
  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const bulkUpdate = async (status: InboundEmailStatus) => {
    if (!visibleSelected.length) return;
    setBulkUpdating(true);
    try {
      const response = await adminFetch('/api/admin/inbound-emails', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: visibleSelected, status }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to update messages');
      if (typeof data.unread === 'number') reportUnread(data.unread);
      setSelected(new Set());
      await fetchEmails();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update messages');
    } finally {
      setBulkUpdating(false);
    }
  };

  // Triaging the last message on a later page steps back instead of showing
  // an empty page while earlier pages still hold matching mail.
  useEffect(() => {
    if (!loading && emails.length === 0 && page > 1) setPage((p) => p - 1);
  }, [loading, emails.length, page]);

  const updateStatus = async (email: InboundEmail, status: InboundEmailStatus) => {
    if (email.status === status) return;
    setUpdating(email.id);
    try {
      const response = await adminFetch(`/api/admin/inbound-emails/${email.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error('Failed to update');
      const { email: updated, unread } = await response.json();

      // The server returns the global unread count with every write; the rows on
      // this page are not the whole inbox, so they can't be counted locally.
      if (typeof unread === 'number') reportUnread(unread);

      // Drop the row when it no longer matches the active (non-"all") filter.
      const leavesView = statusFilter !== 'all' && status !== statusFilter;
      if (leavesView) setTotal((t) => Math.max(0, t - 1));
      setEmails((prev) =>
        leavesView
          ? prev.filter((e) => e.id !== email.id)
          : prev.map((e) => (e.id === email.id ? (updated as InboundEmail) : e)),
      );
    } catch {
      alert('Failed to update email');
    } finally {
      setUpdating(null);
    }
  };

  const openReply = (email: InboundEmail) => {
    setReplyingId(email.id);
    setExpandedId(email.id);
  };

  const sendReply = async (email: InboundEmail, html: string) => {
    const response = await adminFetch(`/api/admin/inbound-emails/${email.id}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Failed to send reply');
    // Keep the row visible (with its Replied chip) until the next refresh.
    if (typeof data.unread === 'number') reportUnread(data.unread);
    setEmails((prev) => prev.map((e) => (e.id === email.id ? (data.email as InboundEmail) : e)));
  };

  return (
    <div>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="email-search" className="sr-only">
            Search email
          </label>
          <input
            id="email-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search sender, subject or text"
            className="w-full sm:w-72 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <span className="flex items-center gap-2">
          <label htmlFor="email-status" className="text-sm text-neutral-400">
            Status:
          </label>
          <select
            id="email-status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as InboundEmailStatus | 'all');
              setPage(1);
            }}
            className="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          </span>
        </div>

        <button
          onClick={fetchEmails}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50 admin-secondary"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-neutral-600 border-t-primary-500 rounded-full animate-spin" />
        </div>
      )}

      {!loading && emails.length > 0 && (
        <div
          role="toolbar"
          aria-label="Bulk actions"
          className="flex flex-wrap items-center gap-2 mb-3 text-sm text-neutral-400"
        >
          <label className="flex items-center gap-2 pr-2">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => setSelected(allSelected ? new Set() : new Set(emails.map((e) => e.id)))}
            />
            {visibleSelected.length ? `${visibleSelected.length} selected` : 'Select all on this page'}
          </label>
          {visibleSelected.length > 0 &&
            ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.value}
                  onClick={() => void bulkUpdate(action.value)}
                  disabled={bulkUpdating}
                  className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium admin-secondary disabled:opacity-50"
                >
                  <Icon className="w-3 h-3" />
                  {action.label}
                </button>
              );
            })}
        </div>
      )}

      {!loading && emails.length === 0 && (
        <div className="text-center py-12 text-neutral-400">
          <Inbox className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>{search ? `No email matches “${search}”.` : 'No email found with the current filter.'}</p>
        </div>
      )}

      {!loading && emails.length > 0 && (
        <div className="space-y-4">
          {emails.map((email) => {
            const isExpanded = expandedId === email.id;
            const statusInfo = STATUS_BADGE[email.status] || STATUS_BADGE.read;
            const attachmentCount = email.attachments?.length || 0;
            const recipients = email.receivedFor.length ? email.receivedFor : email.toAddresses;

            return (
              <div
                key={email.id}
                className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden"
              >
                <div className="flex items-start">
                <input
                  type="checkbox"
                  aria-label={`Select ${email.subject || 'message'} from ${email.fromAddress || 'unknown sender'}`}
                  checked={selected.has(email.id)}
                  onChange={() => toggleSelected(email.id)}
                  className="shrink-0 mt-5 ml-4"
                />
                <button
                  onClick={() => setExpandedId(isExpanded ? null : email.id)}
                  className="flex-1 min-w-0 p-4 text-left hover:bg-neutral-750 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium text-white ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                        {attachmentCount > 0 && (
                          <span className="flex items-center gap-1 px-2 py-1 bg-neutral-700 rounded text-xs text-neutral-300">
                            <Paperclip className="w-3 h-3" />
                            {attachmentCount}
                          </span>
                        )}
                        {!email.bodyFetched && (
                          <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded text-xs border border-yellow-500/30">
                            Body pending
                          </span>
                        )}
                        {email.lastRepliedAt && (
                          <span className="flex items-center gap-1 px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs border border-green-500/30">
                            <CornerUpLeft className="w-3 h-3" />
                            Replied
                          </span>
                        )}
                      </div>

                      <p className={`text-sm truncate ${email.status === 'unread' ? 'text-white font-semibold' : 'text-neutral-200'}`}>
                        {email.subject || '(no subject)'}
                      </p>

                      <div className="flex items-center gap-4 mt-2 text-xs text-neutral-400">
                        <span className="flex items-center gap-1 min-w-0">
                          <Mail className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{email.fromAddress || 'unknown sender'}</span>
                        </span>
                        {recipients.length > 0 && (
                          <span className="hidden sm:inline truncate">→ {recipients.join(', ')}</span>
                        )}
                        <span className="flex items-center gap-1 flex-shrink-0">
                          <Clock className="w-3 h-3" />
                          {formatDate(email.resendCreatedAt || email.createdAt)}
                        </span>
                      </div>
                    </div>

                    <div className="flex-shrink-0">
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-neutral-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-neutral-400" />
                      )}
                    </div>
                  </div>
                </button>
                </div>

                {isExpanded && (
                  <div className="border-t border-neutral-700 p-4 bg-neutral-850">
                    {/* Headers */}
                    <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs mb-4">
                      <dt className="text-neutral-500">From</dt>
                      <dd className="text-neutral-200 break-all">{email.fromAddress || '—'}</dd>
                      <dt className="text-neutral-500">To</dt>
                      <dd className="text-neutral-200 break-all">{email.toAddresses.join(', ') || '—'}</dd>
                      {email.ccAddresses.length > 0 && (
                        <>
                          <dt className="text-neutral-500">Cc</dt>
                          <dd className="text-neutral-200 break-all">{email.ccAddresses.join(', ')}</dd>
                        </>
                      )}
                      {email.receivedFor.length > 0 && (
                        <>
                          <dt className="text-neutral-500">Received for</dt>
                          <dd className="text-neutral-200 break-all">{email.receivedFor.join(', ')}</dd>
                        </>
                      )}
                    </dl>

                    {/* Body */}
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-neutral-300 mb-2">Message</h4>
                      {email.textBody ? (
                        <p className="text-neutral-100 text-sm whitespace-pre-wrap bg-neutral-900 p-3 rounded-lg break-words">
                          {email.textBody}
                        </p>
                      ) : email.htmlBody ? (
                        // Sandboxed (no scripts / same-origin) so untrusted inbound
                        // HTML can never run code or read cookies.
                        <iframe
                          sandbox=""
                          srcDoc={email.htmlBody}
                          title={`Email ${email.id}`}
                          className="w-full h-96 bg-white rounded-lg border border-neutral-700"
                        />
                      ) : (
                        <p className="text-neutral-500 text-sm italic bg-neutral-900 p-3 rounded-lg">
                          {email.bodyFetched ? 'No body content.' : 'Body not fetched yet — check back shortly.'}
                        </p>
                      )}
                    </div>

                    {/* Attachments */}
                    {attachmentCount > 0 && (
                      <div className="mb-4">
                        <h4 className="text-sm font-medium text-neutral-300 mb-2">Attachments</h4>
                        <ul className="space-y-1">
                          {email.attachments.map((att, i) => (
                            <li
                              key={att.id || i}
                              className="flex items-center gap-2 text-xs text-neutral-300 bg-neutral-900 px-3 py-2 rounded-lg"
                            >
                              <Paperclip className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">{att.filename || 'attachment'}</span>
                              {att.content_type && (
                                <span className="text-neutral-500 flex-shrink-0">{att.content_type}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="pt-2 border-t border-neutral-700">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-neutral-400 mr-2">Mark as:</span>
                        {ACTIONS.map((action) => {
                          const Icon = action.icon;
                          const active = email.status === action.value;
                          return (
                            <button
                              key={action.value}
                              onClick={() => updateStatus(email, action.value)}
                              disabled={updating === email.id || active}
                              className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                active
                                  ? `${STATUS_BADGE[action.value].color} text-white`
                                  : 'admin-secondary'
                              }`}
                            >
                              <Icon className="w-3 h-3" />
                              {action.label}
                            </button>
                          );
                        })}
                        {email.fromAddress && replyingId !== email.id && (
                          <button
                            onClick={() => openReply(email)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium bg-primary-600 text-white hover:bg-primary-500 transition-colors ml-auto"
                          >
                            <CornerUpLeft className="w-3 h-3" />
                            Reply
                          </button>
                        )}
                        {updating === email.id && (
                          <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                        )}
                      </div>

                      {/* In-app reply composer — sends from eddy.guide via Resend */}
                      {replyingId === email.id && (
                        <ReplyComposer
                          to={email.fromAddress ?? ''}
                          from={replyFromDisplay(email)}
                          subject={replySubjectDisplay(email.subject)}
                          onSend={(html) => sendReply(email, html)}
                          onClose={() => setReplyingId(null)}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ListPager page={page} total={total} pageSize={PAGE_SIZE} noun="messages" onPage={setPage} />
    </div>
  );
}
