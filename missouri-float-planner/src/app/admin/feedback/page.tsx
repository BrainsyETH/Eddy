'use client';

// src/app/admin/feedback/page.tsx
// Admin page for reviewing user feedback

import { useEffect, useState, useCallback } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import {
  Flag,
  Mail,
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
} from 'lucide-react';
import type { Feedback, FeedbackStatus } from '@/types/api';

const FEEDBACK_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  inaccurate_data: { label: 'Inaccurate Data', color: 'bg-red-500' },
  missing_access_point: { label: 'Missing Access Point', color: 'bg-blue-500' },
  suggestion: { label: 'Suggestion', color: 'bg-purple-500' },
  bug_report: { label: 'Bug Report', color: 'bg-orange-500' },
  other: { label: 'Other', color: 'bg-neutral-500' },
};

const STATUS_OPTIONS: { value: FeedbackStatus; label: string; color: string }[] = [
  { value: 'pending', label: 'Pending', color: 'bg-yellow-500' },
  { value: 'reviewed', label: 'Reviewed', color: 'bg-blue-500' },
  { value: 'resolved', label: 'Resolved', color: 'bg-green-500' },
  { value: 'dismissed', label: 'Dismissed', color: 'bg-neutral-500' },
];

export default function FeedbackAdminPage() {
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | 'all'>('pending');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchFeedback = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }
      params.set('limit', '100');

      const response = await fetch(`/api/feedback?${params.toString()}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch feedback');
      }

      const data = await response.json();
      setFeedback(data.feedback);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch feedback');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchFeedback();
  }, [fetchFeedback]);

  const updateFeedbackStatus = async (id: string, status: FeedbackStatus, adminNotes?: string) => {
    setUpdating(id);

    try {
      const response = await fetch(`/api/feedback/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, adminNotes }),
      });

      if (!response.ok) {
        throw new Error('Failed to update feedback');
      }

      const data = await response.json();

      // Update local state
      setFeedback((prev) =>
        prev.map((f) => (f.id === id ? data.feedback : f))
      );
    } catch (err) {
      console.error('Error updating feedback:', err);
      alert('Failed to update feedback');
    } finally {
      setUpdating(null);
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

  return (
    <AdminLayout
      title="Feedback"
      description="Review user-submitted feedback and data reports"
    >
      <div className="p-6">
        {/* Filter Bar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <label className="text-sm text-neutral-400">Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as FeedbackStatus | 'all')}
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
            className="flex items-center gap-2 px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
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

        {/* Empty State */}
        {!loading && feedback.length === 0 && (
          <div className="text-center py-12 text-neutral-400">
            <Flag className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No feedback found with the current filter.</p>
          </div>
        )}

        {/* Feedback List */}
        {!loading && feedback.length > 0 && (
          <div className="space-y-4">
            {feedback.map((item) => {
              const isExpanded = expandedId === item.id;
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

                      {/* Admin Notes */}
                      {item.adminNotes && (
                        <div className="mb-4">
                          <h4 className="text-sm font-medium text-neutral-300 mb-2">Admin Notes</h4>
                          <p className="text-neutral-300 text-sm bg-neutral-900 p-3 rounded-lg">
                            {item.adminNotes}
                          </p>
                        </div>
                      )}

                      {/* Review Info */}
                      {item.reviewedAt && (
                        <div className="mb-4 text-xs text-neutral-400">
                          Reviewed on {formatDate(item.reviewedAt)}
                          {item.reviewedBy && ` by ${item.reviewedBy}`}
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 pt-2 border-t border-neutral-700">
                        <span className="text-sm text-neutral-400 mr-2">Update Status:</span>
                        {STATUS_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => updateFeedbackStatus(item.id, opt.value)}
                            disabled={updating === item.id || item.status === opt.value}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                              item.status === opt.value
                                ? `${opt.color} text-white`
                                : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
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
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
