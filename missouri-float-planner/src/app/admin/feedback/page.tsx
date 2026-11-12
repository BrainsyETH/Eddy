'use client';
import {
  useAdminInteractions,
  useUnsavedAdminChanges,
} from '@/components/admin/AdminInteractionProvider';

// src/app/admin/feedback/page.tsx
// Admin page for reviewing user feedback

import { useEffect, useState, useCallback } from 'react';
import { useAdminListState } from '@/hooks/useAdminListState';
import { adminFetch } from '@/hooks/useAdminAuth';
import AdminLayout from '@/components/admin/AdminLayout';
import InboundEmailList from '@/components/admin/InboundEmailList';
import ListPager from '@/components/admin/ListPager';
import ReportedPhotoPanel from '@/components/admin/ReportedPhotoPanel';
import {
  FEEDBACK_PAGE_SIZE,
  MAX_ADMIN_NOTES_LENGTH,
  FEEDBACK_REPLY_SUBJECT,
  FEEDBACK_SUPPORT_ADDRESS,
  REPORTED_PHOTO_TYPE,
  reportedPhotoContext,
} from '@/lib/feedback/admin';
import ReplyComposer from '@/components/admin/ReplyComposer';
import {
  Flag,
  Mail,
  Inbox,
  User,
  Clock,
  MapPin,
  Activity,
  CheckCircle,
  XCircle,
  Eye,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  CornerUpLeft,
} from 'lucide-react';
import type { Feedback, FeedbackStatus } from '@/types/api';


// Unlisted types fall back to the `other` badge below, which is why the two
// newest ones are here: a gauge recalibration and a photo report were both
// arriving in this queue wearing a grey "Other" chip, i.e. looking exactly like
// the typo corrections they need to be triaged differently from.
//
// `objectionable_content` is the one row in this table with a clock on it. It is
// the App Store's required reporting route for community photos, the remedy is
// to unpublish rather than to correct a field, and the guideline expects it
// acted on promptly — so it gets the loudest chip here.
const FEEDBACK_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  inaccurate_data: { label: 'Inaccurate Data', color: 'bg-red-500' },
  missing_access_point: { label: 'Missing Access Point', color: 'bg-blue-500' },
  suggestion: { label: 'Suggestion', color: 'bg-purple-500' },
  bug_report: { label: 'Bug Report', color: 'bg-orange-500' },
  gauge_recalibration: { label: 'Gauge Recalibration', color: 'bg-amber-500' },
  objectionable_content: { label: 'Reported Photo', color: 'bg-rose-600' },
  partner: { label: 'Partner Enquiry', color: 'bg-teal-500' },
  other: { label: 'Other', color: 'bg-neutral-500' },
};

const STATUS_OPTIONS: { value: FeedbackStatus; label: string; color: string }[] = [
  { value: 'pending', label: 'Pending', color: 'bg-yellow-500' },
  { value: 'reviewed', label: 'Reviewed', color: 'bg-blue-500' },
  { value: 'resolved', label: 'Resolved', color: 'bg-green-500' },
  { value: 'dismissed', label: 'Dismissed', color: 'bg-neutral-500' },
];

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

export default function FeedbackAdminPage() {
  const { alert } = useAdminInteractions();
  const [view, setView] = useAdminListState('view', 'feedback');
  const [emailUnread, setEmailUnread] = useState(0);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | 'all'>('pending');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  // Pending reported photos are pinned above the list: they are the one kind of
  // feedback with a clock on it (App Store reporting route), so they never wait
  // behind older items on a later page.
  const [pinned, setPinned] = useState<Feedback[]>([]);
  const showPinned = statusFilter === 'pending' || statusFilter === 'all';
  // Unsaved note text per item; absent means "same as saved".
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savingNote, setSavingNote] = useState<string | null>(null);
  // Drafts survive paging and filters (they are keyed by item), but not leaving
  // the page, so the workspace's leave/reload guard covers them.
  useUnsavedAdminChanges(
    Object.entries(noteDrafts).some(([id, text]) => {
      const saved = [...pinned, ...feedback].find((f) => f.id === id);
      // A draft for an item on another page can't be compared, so it counts.
      return !saved || text.trim() !== (saved.adminNotes ?? '');
    }),
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyFrom, setReplyFrom] = useState(FEEDBACK_SUPPORT_ADDRESS);
  const [updating, setUpdating] = useState<string | null>(null);

  // Probe the unread-email count on mount so the Email sub-tab shows a badge
  // before it's ever opened. Kept live afterwards by InboundEmailList.
  useEffect(() => {
    adminFetch('/api/admin/inbound-emails?status=unread&limit=1')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setEmailUnread(data.unread ?? 0);
      })
      .catch(() => {});
  }, []);

  const fetchFeedback = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }
      params.set('limit', String(FEEDBACK_PAGE_SIZE));
      params.set('offset', String((page - 1) * FEEDBACK_PAGE_SIZE));
      if (showPinned) params.set('pinned', 'photos');

      const [response, pinnedResponse] = await Promise.all([
        adminFetch(`/api/feedback?${params.toString()}`),
        showPinned
          ? adminFetch(`/api/feedback?status=pending&type=${REPORTED_PHOTO_TYPE}&limit=100`)
          : null,
      ]);
      if (!response.ok || (pinnedResponse && !pinnedResponse.ok)) {
        const data = await (response.ok ? pinnedResponse! : response).json().catch(() => ({}));
        throw new Error(data.error || 'Failed to fetch feedback');
      }

      const data = await response.json();
      setFeedback(data.feedback);
      setTotal(data.total ?? 0);
      if (data.replyFrom) setReplyFrom(data.replyFrom);
      setPinned(pinnedResponse ? (await pinnedResponse.json()).feedback : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch feedback');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page, showPinned]);

  useEffect(() => {
    fetchFeedback();
  }, [fetchFeedback]);

  useEffect(() => {
    if (!loading && feedback.length === 0 && page > 1) setPage((p) => p - 1);
  }, [loading, feedback.length, page]);

  /** An item can be in the pinned list or the main list; update it in place. */
  const replaceItem = (updated: Feedback) => {
    const swap = (prev: Feedback[]) => prev.map((f) => (f.id === updated.id ? updated : f));
    setFeedback(swap);
    setPinned(swap);
  };

  const updateFeedbackStatus = async (id: string, status: FeedbackStatus) => {
    setUpdating(id);

    try {
      const response = await adminFetch(`/api/admin/feedback/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        throw new Error('Failed to update feedback');
      }

      const data = await response.json();
      replaceItem(data.feedback);
    } catch (err) {
      console.error('Error updating feedback:', err);
      alert('Failed to update feedback');
    } finally {
      setUpdating(null);
    }
  };

  const sendReply = async (item: Feedback, html: string) => {
    const response = await adminFetch(`/api/admin/feedback/${item.id}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Failed to send reply');
    replaceItem(data.feedback);
    return { warning: data.warning ?? null };
  };

  const saveNote = async (id: string) => {
    const adminNotes = noteDrafts[id];
    if (adminNotes === undefined) return;
    setSavingNote(id);
    try {
      const response = await adminFetch(`/api/admin/feedback/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminNotes }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to save note');
      replaceItem(data.feedback);
      setNoteDrafts((d) => withoutKey(d, id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save note');
    } finally {
      setSavingNote(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getContextIcon = (contextType: string | null) => {
    switch (contextType) {
      case 'gauge':
        return <Activity className="w-4 h-4" />;
      case 'access_point':
        return <MapPin className="w-4 h-4" />;
      default:
        return <Flag className="w-4 h-4" />;
    }
  };

  const renderItem = (item: Feedback) => {
    const isExpanded = expandedId === item.id;
    const photo = reportedPhotoContext(item);
    const typeInfo = FEEDBACK_TYPE_LABELS[item.feedbackType] || FEEDBACK_TYPE_LABELS.other;
    const statusInfo = STATUS_OPTIONS.find((s) => s.value === item.status) || STATUS_OPTIONS[0];

    return (
      <div
        key={item.id}
        className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden"
      >
        {/* Header - Always Visible */}
        <button
          onClick={() => setExpandedId(isExpanded ? null : item.id)}
          className="w-full p-4 text-left hover:bg-neutral-750 transition-colors"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {/* Type & Status Badges */}
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-2 py-1 rounded text-xs font-medium text-white ${typeInfo.color}`}>
                  {typeInfo.label}
                </span>
                <span className={`px-2 py-1 rounded text-xs font-medium text-white ${statusInfo.color}`}>
                  {statusInfo.label}
                </span>
                {item.contextType && (
                  <span className="flex items-center gap-1 px-2 py-1 bg-neutral-700 rounded text-xs text-neutral-300">
                    {getContextIcon(item.contextType)}
                    {item.contextName || item.contextType}
                  </span>
                )}
                {item.lastRepliedAt && (
                  <span className="flex items-center gap-1 px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs border border-green-500/30">
                    <CornerUpLeft className="w-3 h-3" />
                    Replied
                  </span>
                )}
              </div>

              {/* Message Preview */}
              <p className="text-white text-sm line-clamp-2">{item.message}</p>

              {/* Meta Info */}
              <div className="flex items-center gap-4 mt-2 text-xs text-neutral-400">
                {item.userName && (
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3" />
                    {item.userName}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Mail className="w-3 h-3" />
                  {item.userEmail}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDate(item.createdAt)}
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

        {/* Expanded Content */}
        {isExpanded && (
          <div className="border-t border-neutral-700 p-4 bg-neutral-850">
            {photo && (
              <ReportedPhotoPanel
                photo={photo}
                onTakenDown={() => {
                  if (item.status === 'pending') void updateFeedbackStatus(item.id, 'resolved');
                }}
              />
            )}

            {/* Full Message */}
            <div className="mb-4">
              <h4 className="text-sm font-medium text-neutral-300 mb-2">Full Message</h4>
              <p className="text-white text-sm whitespace-pre-wrap bg-neutral-900 p-3 rounded-lg">
                {item.message}
              </p>
            </div>

            {/* Context Data */}
            {item.contextData && (
              <div className="mb-4">
                <h4 className="text-sm font-medium text-neutral-300 mb-2">Context Data</h4>
                <pre className="text-xs text-neutral-300 bg-neutral-900 p-3 rounded-lg overflow-x-auto">
                  {JSON.stringify(item.contextData, null, 2)}
                </pre>
              </div>
            )}

            {/* Admin Notes — internal, never sent to the submitter */}
            <div className="mb-4">
              <label
                htmlFor={`notes-${item.id}`}
                className="block text-sm font-medium text-neutral-300 mb-2"
              >
                Notes
              </label>
              <textarea
                id={`notes-${item.id}`}
                value={noteDrafts[item.id] ?? item.adminNotes ?? ''}
                onChange={(e) =>
                  setNoteDrafts((d) => ({ ...d, [item.id]: e.target.value }))
                }
                maxLength={MAX_ADMIN_NOTES_LENGTH}
                rows={3}
                placeholder="Only admins see this."
                className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              {noteDrafts[item.id] !== undefined &&
                noteDrafts[item.id].trim() !== (item.adminNotes ?? '') && (
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => saveNote(item.id)}
                      disabled={savingNote === item.id}
                      className="px-3 py-1.5 rounded text-xs font-medium bg-primary-600 text-white hover:bg-primary-500 disabled:opacity-50"
                    >
                      {savingNote === item.id ? 'Saving…' : 'Save note'}
                    </button>
                    <button
                      onClick={() =>
                        setNoteDrafts((d) => withoutKey(d, item.id))
                      }
                      disabled={savingNote === item.id}
                      className="px-3 py-1.5 rounded text-xs font-medium admin-secondary"
                    >
                      Discard
                    </button>
                  </div>
                )}
            </div>

            {/* Review Info */}
            {item.reviewedAt && (
              <div className="mb-4 text-xs text-neutral-400">
                Reviewed on {formatDate(item.reviewedAt)}
                {item.reviewedBy && ` by ${item.reviewedBy}`}
              </div>
            )}
            {item.lastRepliedAt && (
              <div className="mb-4 text-xs text-neutral-400">
                Replied on {formatDate(item.lastRepliedAt)}
                {item.lastRepliedBy && ` by ${item.lastRepliedBy}`}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-700">
              <span className="text-sm text-neutral-400 mr-2">Update Status:</span>
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => updateFeedbackStatus(item.id, opt.value)}
                  disabled={updating === item.id || item.status === opt.value}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    item.status === opt.value
                      ? `${opt.color} text-white`
                      : 'admin-secondary'
                  }`}
                >
                  {opt.value === 'resolved' && <CheckCircle className="w-3 h-3" />}
                  {opt.value === 'dismissed' && <XCircle className="w-3 h-3" />}
                  {opt.value === 'reviewed' && <Eye className="w-3 h-3" />}
                  {opt.label}
                </button>
              ))}
              {updating === item.id && (
                <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin ml-2" />
              )}
              {replyingId !== item.id && (
                <button
                  onClick={() => setReplyingId(item.id)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium bg-primary-600 text-white hover:bg-primary-500 transition-colors ml-auto"
                >
                  <CornerUpLeft className="w-3 h-3" />
                  Reply
                </button>
              )}
            </div>
            {replyingId === item.id && (
              <ReplyComposer
                to={item.userName ? `${item.userName} <${item.userEmail}>` : item.userEmail}
                from={replyFrom}
                subject={FEEDBACK_REPLY_SUBJECT}
                onSend={(html) => sendReply(item, html)}
                onClose={() => setReplyingId(null)}
              />
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <AdminLayout
      title="Feedback & Email"
      description="Review user-submitted feedback and mail received at eddy.guide"
    >
      <div className="p-6">
        {/* Sub-tab switcher: user feedback vs. inbound email */}
        <div className="flex items-center gap-1 mb-6 border-b border-neutral-700">
          <button
            onClick={() => setView('feedback')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              view === 'feedback'
                ? 'border-primary-500 text-white'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Flag className="w-4 h-4" />
            Feedback
          </button>
          <button
            onClick={() => setView('email')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              view === 'email'
                ? 'border-primary-500 text-white'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Inbox className="w-4 h-4" />
            Inbound Email
            {emailUnread > 0 && (
              <span className="px-1.5 py-0.5 text-xs font-medium bg-blue-500/20 text-blue-400 rounded-full border border-blue-500/30">
                {emailUnread}
              </span>
            )}
          </button>
        </div>

        {view === 'email' && <InboundEmailList onUnreadChange={setEmailUnread} />}

        {view === 'feedback' && (
        <>
        {/* Filter Bar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <label className="text-sm text-neutral-400">Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as FeedbackStatus | 'all');
                setPage(1);
              }}
              className="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All</option>
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={fetchFeedback}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50 admin-secondary"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-neutral-600 border-t-primary-500 rounded-full animate-spin" />
          </div>
        )}

        {/* Pinned: pending reported photos */}
        {!loading && pinned.length > 0 && (
          <section aria-labelledby="pinned-photos" className="mb-6">
            <h2 id="pinned-photos" className="text-sm font-semibold text-neutral-200 mb-2">
              Reported photos · {pinned.length} waiting
            </h2>
            <p className="text-xs text-neutral-400 mb-3">
              App Store reports. Hide or remove the photo, then the item is marked resolved.
            </p>
            <div className="space-y-4">{pinned.map(renderItem)}</div>
          </section>
        )}

        {/* Empty State */}
        {!loading && feedback.length === 0 && pinned.length === 0 && (
          <div className="text-center py-12 text-neutral-400">
            <Flag className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No feedback found with the current filter.</p>
          </div>
        )}

        {/* Feedback List */}
        {!loading && feedback.length > 0 && (
          <div className="space-y-4">
            {feedback.map(renderItem)}
          </div>
        )}

        <ListPager page={page} total={total} pageSize={FEEDBACK_PAGE_SIZE} noun="items" onPage={setPage} />
        </>
        )}
      </div>
    </AdminLayout>
  );
}
