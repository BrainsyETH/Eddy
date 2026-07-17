'use client';

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
} from 'lucide-react';
import type { InboundEmail, InboundEmailStatus } from '@/types/api';

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
  const [emails, setEmails] = useState<InboundEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<InboundEmailStatus | 'all'>('unread');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

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
      params.set('limit', '100');

      const response = await adminFetch(`/api/admin/inbound-emails?${params.toString()}`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to fetch email');
      }
      const data = await response.json();
      setEmails(data.emails);
      reportUnread(data.unread ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch email');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, reportUnread]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

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
      const { email: updated } = await response.json();

      // Keep the global unread badge in sync without a full refetch.
      const wasUnread = email.status === 'unread';
      const nowUnread = status === 'unread';
      if (wasUnread !== nowUnread) {
        // Recompute from the loaded set plus the delta on this row.
        const delta = nowUnread ? 1 : -1;
        const localUnread = emails.filter((e) => e.status === 'unread').length + delta;
        reportUnread(Math.max(0, localUnread));
      }

      setEmails((prev) => {
        // Drop the row when it no longer matches the active (non-"all") filter.
        if (statusFilter !== 'all' && status !== statusFilter) {
          return prev.filter((e) => e.id !== email.id);
        }
        return prev.map((e) => (e.id === email.id ? (updated as InboundEmail) : e));
      });
    } catch {
      alert('Failed to update email');
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div>
      {/* Filter bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <label className="text-sm text-neutral-400">Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as InboundEmailStatus | 'all')}
            className="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={fetchEmails}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
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

      {!loading && emails.length === 0 && (
        <div className="text-center py-12 text-neutral-400">
          <Inbox className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No email found with the current filter.</p>
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
                <button
                  onClick={() => setExpandedId(isExpanded ? null : email.id)}
                  className="w-full p-4 text-left hover:bg-neutral-750 transition-colors"
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
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-700">
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
                                : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
                            }`}
                          >
                            <Icon className="w-3 h-3" />
                            {action.label}
                          </button>
                        );
                      })}
                      {email.fromAddress && (
                        <a
                          href={`mailto:${email.fromAddress}${email.subject ? `?subject=Re: ${encodeURIComponent(email.subject)}` : ''}`}
                          className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium bg-primary-600 text-white hover:bg-primary-500 transition-colors ml-auto"
                        >
                          <Mail className="w-3 h-3" />
                          Reply
                        </a>
                      )}
                      {updating === email.id && (
                        <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
