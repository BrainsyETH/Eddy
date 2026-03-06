'use client';

// src/app/admin/reports/page.tsx
// Admin page for moderating community reports (hazards, water levels, debris)

import { useState, useEffect, useCallback, useMemo } from 'react';
import { adminFetch } from '@/hooks/useAdminAuth';
import AdminLayout from '@/components/admin/AdminLayout';
import {
  AlertTriangle,
  CheckCircle,
  Filter,
  X,
  ChevronDown,
  ChevronRight,
  Trash2,
  ShieldCheck,
  XCircle,
  Clock,
  Image as ImageIcon,
  Link as LinkIcon,
} from 'lucide-react';

interface Report {
  id: string;
  riverId: string | null;
  riverName: string | null;
  hazardId: string | null;
  hazardName: string | null;
  type: string;
  latitude: number;
  longitude: number;
  riverMile: number | null;
  imageUrl: string | null;
  description: string | null;
  status: string;
  verifiedAt: string | null;
  createdAt: string;
}

const REPORT_TYPES = [
  { value: 'hazard', label: 'Hazard' },
  { value: 'water_level', label: 'Water Level' },
  { value: 'debris', label: 'Debris' },
];

const REPORT_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'verified', label: 'Verified' },
  { value: 'rejected', label: 'Rejected' },
];

function getStatusClasses(status: string): string {
  switch (status) {
    case 'pending':
      return 'bg-yellow-500/20 text-yellow-400';
    case 'verified':
      return 'bg-green-500/20 text-green-400';
    case 'rejected':
      return 'bg-red-500/20 text-red-400';
    default:
      return 'bg-neutral-600 text-neutral-400';
  }
}

function getTypeBadgeClasses(type: string): string {
  switch (type) {
    case 'hazard':
      return 'bg-orange-500/20 text-orange-400';
    case 'water_level':
      return 'bg-blue-500/20 text-blue-400';
    case 'debris':
      return 'bg-amber-500/20 text-amber-400';
    default:
      return 'bg-neutral-600 text-neutral-400';
  }
}

function getTypeLabel(type: string): string {
  return REPORT_TYPES.find(t => t.value === type)?.label || type;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function AdminReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalReports, setTotalReports] = useState(0);
  const [pageLimit] = useState(50);

  const fetchReports = useCallback(async (p: number = page) => {
    try {
      setLoading(true);
      const res = await adminFetch(`/api/admin/reports?page=${p}&limit=${pageLimit}`);
      if (!res.ok) throw new Error('Failed to fetch reports');
      const data = await res.json();
      setReports(data.reports);
      setTotalReports(data.total ?? data.reports.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [page, pageLimit]);

  useEffect(() => {
    fetchReports(page);
  }, [page, fetchReports]);

  const filteredReports = useMemo(() => {
    let result = reports;

    // Show pending reports first
    result = [...result].sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    if (statusFilter !== 'all') {
      result = result.filter(r => r.status === statusFilter);
    }
    if (typeFilter !== 'all') {
      result = result.filter(r => r.type === typeFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(r =>
        r.riverName?.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q) ||
        r.hazardName?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [reports, statusFilter, typeFilter, searchQuery]);

  const updateReport = async (report: Report, newStatus: 'verified' | 'rejected') => {
    try {
      setUpdating(report.id);
      setError(null);
      const res = await adminFetch(`/api/admin/reports/${report.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Failed to ${newStatus} report`);
      }
      setSuccessMessage(`Report ${newStatus}`);
      setTimeout(() => setSuccessMessage(null), 3000);
      await fetchReports();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${newStatus} report`);
    } finally {
      setUpdating(null);
    }
  };

  const deleteReport = async (report: Report) => {
    if (!confirm('Delete this report? This cannot be undone.')) return;
    try {
      setDeleting(report.id);
      const res = await adminFetch(`/api/admin/reports/${report.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete');
      }
      setSuccessMessage('Report deleted');
      setTimeout(() => setSuccessMessage(null), 3000);
      await fetchReports();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <AdminLayout
      title="Community Reports"
      description="Moderate hazard reports, water level updates, and debris sightings"
    >
      <div className="p-6 space-y-4 max-w-6xl">
        {error && (
          <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-200 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
          </div>
        )}
        {successMessage && (
          <div className="p-4 bg-green-500/20 border border-green-500/50 rounded-lg text-green-200 flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            {successMessage}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-neutral-400" />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 bg-neutral-800 border border-neutral-600 rounded-lg text-white text-sm"
            >
              <option value="all">All Statuses</option>
              {REPORT_STATUSES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="px-3 py-1.5 bg-neutral-800 border border-neutral-600 rounded-lg text-white text-sm"
            >
              <option value="all">All Types</option>
              {REPORT_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="px-3 py-1.5 bg-neutral-800 border border-neutral-600 rounded-lg text-white text-sm placeholder-neutral-500 w-48"
            />
          </div>
        </div>

        {/* Report List */}
        {loading ? (
          <div className="text-center py-12 text-neutral-400">Loading reports...</div>
        ) : (
          <>
            <p className="text-sm text-neutral-400">
              {filteredReports.length} of {reports.length} reports
            </p>
            <div className="space-y-2">
              {filteredReports.map(report => (
                <div
                  key={report.id}
                  className="bg-neutral-800 rounded-lg border border-neutral-700 overflow-hidden"
                >
                  <div
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-neutral-750"
                    onClick={() => setExpandedReport(expandedReport === report.id ? null : report.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {expandedReport === report.id ? (
                        <ChevronDown className="w-4 h-4 text-neutral-400 shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-neutral-400 shrink-0" />
                      )}
                      <span className={`px-2 py-0.5 text-xs rounded-full shrink-0 ${getTypeBadgeClasses(report.type)}`}>
                        {getTypeLabel(report.type)}
                      </span>
                      <div className="min-w-0">
                        <h3 className="font-medium text-white truncate">
                          {report.riverName || 'Unknown River'}
                          {report.riverMile != null && ` \u2022 Mile ${report.riverMile.toFixed(1)}`}
                        </h3>
                        <p className="text-xs text-neutral-400 truncate">
                          {report.description
                            ? report.description.length > 80
                              ? report.description.slice(0, 80) + '...'
                              : report.description
                            : 'No description'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusClasses(report.status)}`}>
                        {report.status}
                      </span>
                      <span className="text-xs text-neutral-500 hidden sm:inline">
                        <Clock className="w-3 h-3 inline mr-1" />
                        {formatTime(report.createdAt)}
                      </span>
                    </div>
                  </div>

                  {expandedReport === report.id && (
                    <div className="border-t border-neutral-700 p-4 space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <span className="text-neutral-400 text-xs">Latitude</span>
                          <p className="text-white font-mono">{report.latitude.toFixed(6)}</p>
                        </div>
                        <div>
                          <span className="text-neutral-400 text-xs">Longitude</span>
                          <p className="text-white font-mono">{report.longitude.toFixed(6)}</p>
                        </div>
                        <div>
                          <span className="text-neutral-400 text-xs">River Mile</span>
                          <p className="text-white">{report.riverMile?.toFixed(1) ?? 'N/A'}</p>
                        </div>
                        <div>
                          <span className="text-neutral-400 text-xs">Created</span>
                          <p className="text-white">{new Date(report.createdAt).toLocaleString()}</p>
                        </div>
                      </div>
                      {report.description && (
                        <div>
                          <span className="text-neutral-400 text-xs">Description</span>
                          <p className="text-white text-sm">{report.description}</p>
                        </div>
                      )}
                      {report.hazardName && (
                        <div className="flex items-center gap-2">
                          <LinkIcon className="w-3.5 h-3.5 text-neutral-400" />
                          <span className="text-neutral-400 text-xs">Linked Hazard:</span>
                          <span className="text-white text-sm">{report.hazardName}</span>
                        </div>
                      )}
                      {report.imageUrl && (
                        <div>
                          <span className="text-neutral-400 text-xs flex items-center gap-1 mb-1">
                            <ImageIcon className="w-3.5 h-3.5" />
                            Image
                          </span>
                          <img
                            src={report.imageUrl}
                            alt="Report image"
                            className="max-w-xs max-h-48 object-cover rounded border border-neutral-700"
                          />
                        </div>
                      )}
                      {report.verifiedAt && (
                        <div>
                          <span className="text-neutral-400 text-xs">Verified At</span>
                          <p className="text-white text-sm">{new Date(report.verifiedAt).toLocaleString()}</p>
                        </div>
                      )}
                      <div className="flex justify-end gap-2 pt-2">
                        {report.status === 'pending' && (
                          <>
                            <button
                              onClick={() => updateReport(report, 'verified')}
                              disabled={updating === report.id}
                              className="flex items-center gap-2 px-3 py-1.5 text-green-400 hover:text-green-300 hover:bg-green-500/10 rounded-lg text-sm transition-colors disabled:opacity-50"
                            >
                              <ShieldCheck className="w-4 h-4" />
                              {updating === report.id ? 'Updating...' : 'Verify'}
                            </button>
                            <button
                              onClick={() => updateReport(report, 'rejected')}
                              disabled={updating === report.id}
                              className="flex items-center gap-2 px-3 py-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg text-sm transition-colors disabled:opacity-50"
                            >
                              <XCircle className="w-4 h-4" />
                              {updating === report.id ? 'Updating...' : 'Reject'}
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => deleteReport(report)}
                          disabled={deleting === report.id}
                          className="flex items-center gap-2 px-3 py-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg text-sm transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4" />
                          {deleting === report.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination Controls */}
            {totalReports > pageLimit && (
              <div className="flex items-center justify-between pt-4">
                <p className="text-sm text-neutral-500">
                  Page {page} of {Math.ceil(totalReports / pageLimit)} ({totalReports} total)
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
                    disabled={page >= Math.ceil(totalReports / pageLimit)}
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
