'use client';

// src/app/admin/activity/page.tsx
// Admin page for viewing the activity log of all admin actions

import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/hooks/useAdminAuth';
import AdminLayout from '@/components/admin/AdminLayout';
import {
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Filter,
  X,
  Clock,
} from 'lucide-react';

interface ActivityEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  entityName: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

const ENTITY_TYPES = [
  { value: 'access_point', label: 'Access Point' },
  { value: 'blog_post', label: 'Blog Post' },
  { value: 'gauge', label: 'Gauge' },
  { value: 'poi', label: 'POI' },
  { value: 'hazard', label: 'Hazard' },
  { value: 'community_report', label: 'Community Report' },
];

const ACTIONS = [
  { value: 'create', label: 'Create' },
  { value: 'update', label: 'Update' },
  { value: 'delete', label: 'Delete' },
  { value: 'approve', label: 'Approve' },
  { value: 'reject', label: 'Reject' },
];

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-green-500/20 text-green-400',
  update: 'bg-blue-500/20 text-blue-400',
  delete: 'bg-red-500/20 text-red-400',
  approve: 'bg-green-500/20 text-green-400',
  reject: 'bg-red-500/20 text-red-400',
};

function formatTimeAgo(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;

  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo ago`;
}

function getEntityTypeLabel(type: string): string {
  return ENTITY_TYPES.find(t => t.value === type)?.label || type;
}

function getActionLabel(action: string): string {
  return ACTIONS.find(a => a.value === action)?.label || action;
}

export default function AdminActivityPage() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [entityTypeFilter, setEntityTypeFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalEntries, setTotalEntries] = useState(0);
  const [pageLimit] = useState(50);

  const fetchEntries = useCallback(async (p: number = page) => {
    try {
      setLoading(true);
      let url = `/api/admin/activity?page=${p}&limit=${pageLimit}`;
      if (entityTypeFilter !== 'all') url += `&entity_type=${entityTypeFilter}`;
      if (actionFilter !== 'all') url += `&action=${actionFilter}`;
      const res = await adminFetch(url);
      if (!res.ok) throw new Error('Failed to fetch activity log');
      const data = await res.json();
      setEntries(data.entries);
      setTotalEntries(data.total ?? data.entries.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [page, pageLimit, entityTypeFilter, actionFilter]);

  useEffect(() => {
    fetchEntries(page);
  }, [page, fetchEntries]);

  useEffect(() => {
    setPage(1);
  }, [entityTypeFilter, actionFilter]);

  const renderDetails = (details: Record<string, unknown>) => {
    const keys = Object.keys(details);
    if (keys.length === 0) return <span className="text-neutral-500 text-sm">No details</span>;

    return (
      <div className="space-y-1">
        {keys.map(key => {
          const value = details[key];
          // Check if value is an object with old/new fields (change tracking)
          if (
            value &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            'old' in (value as Record<string, unknown>) &&
            'new' in (value as Record<string, unknown>)
          ) {
            const change = value as { old: unknown; new: unknown };
            return (
              <div key={key} className="text-sm">
                <span className="text-neutral-400">{key}:</span>{' '}
                <span className="text-red-400 line-through">{String(change.old ?? 'null')}</span>
                <span className="text-neutral-500 mx-1">&rarr;</span>
                <span className="text-green-400">{String(change.new ?? 'null')}</span>
              </div>
            );
          }

          return (
            <div key={key} className="text-sm">
              <span className="text-neutral-400">{key}:</span>{' '}
              <span className="text-white font-mono text-xs">
                {typeof value === 'object' ? JSON.stringify(value) : String(value ?? 'null')}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <AdminLayout
      title="Activity Log"
      description="View a log of all admin actions and changes"
    >
      <div className="p-6 space-y-4 max-w-6xl">
        {error && (
          <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-200 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-neutral-400" />
          <select
            value={entityTypeFilter}
            onChange={e => setEntityTypeFilter(e.target.value)}
            className="px-3 py-1.5 bg-neutral-800 border border-neutral-600 rounded-lg text-white text-sm"
          >
            <option value="all">All Entity Types</option>
            {ENTITY_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <select
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value)}
            className="px-3 py-1.5 bg-neutral-800 border border-neutral-600 rounded-lg text-white text-sm"
          >
            <option value="all">All Actions</option>
            {ACTIONS.map(a => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
        </div>

        {/* Entry List */}
        {loading ? (
          <div className="text-center py-12 text-neutral-400">Loading activity log...</div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12 text-neutral-400">No activity recorded yet</div>
        ) : (
          <>
            <p className="text-sm text-neutral-400">
              {entries.length} of {totalEntries} entries
            </p>
            <div className="space-y-2">
              {entries.map(entry => (
                <div
                  key={entry.id}
                  className="bg-neutral-800 rounded-lg border border-neutral-700 overflow-hidden"
                >
                  <div
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-neutral-750"
                    onClick={() => setExpandedEntry(expandedEntry === entry.id ? null : entry.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {expandedEntry === entry.id ? (
                        <ChevronDown className="w-4 h-4 text-neutral-400 shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-neutral-400 shrink-0" />
                      )}
                      <span className={`px-2 py-0.5 text-xs rounded-full shrink-0 ${ACTION_COLORS[entry.action] || 'bg-neutral-600 text-neutral-300'}`}>
                        {getActionLabel(entry.action)}
                      </span>
                      <div className="min-w-0">
                        <h3 className="font-medium text-white truncate">
                          {entry.entityName || entry.entityId}
                        </h3>
                        <p className="text-xs text-neutral-400">
                          {getEntityTypeLabel(entry.entityType)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 text-neutral-400">
                      <Clock className="w-3.5 h-3.5" />
                      <span className="text-xs">{formatTimeAgo(entry.createdAt)}</span>
                    </div>
                  </div>

                  {expandedEntry === entry.id && (
                    <div className="border-t border-neutral-700 p-4 space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <span className="text-neutral-400 text-xs">Action</span>
                          <p className="text-white">{getActionLabel(entry.action)}</p>
                        </div>
                        <div>
                          <span className="text-neutral-400 text-xs">Entity Type</span>
                          <p className="text-white">{getEntityTypeLabel(entry.entityType)}</p>
                        </div>
                        <div>
                          <span className="text-neutral-400 text-xs">Entity ID</span>
                          <p className="text-white font-mono text-xs break-all">{entry.entityId}</p>
                        </div>
                        <div>
                          <span className="text-neutral-400 text-xs">Time</span>
                          <p className="text-white text-xs">{new Date(entry.createdAt).toLocaleString()}</p>
                        </div>
                      </div>
                      {entry.details && Object.keys(entry.details).length > 0 && (
                        <div>
                          <span className="text-neutral-400 text-xs">Changes</span>
                          <div className="mt-1 p-3 bg-neutral-900 rounded-lg">
                            {renderDetails(entry.details)}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination Controls */}
            {totalEntries > pageLimit && (
              <div className="flex items-center justify-between pt-4">
                <p className="text-sm text-neutral-500">
                  Page {page} of {Math.ceil(totalEntries / pageLimit)} ({totalEntries} total)
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-white text-sm rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage(p => p + 1)}
                    disabled={page >= Math.ceil(totalEntries / pageLimit)}
                    className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-white text-sm rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
