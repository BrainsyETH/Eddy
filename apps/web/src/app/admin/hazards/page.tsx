'use client';

// src/app/admin/hazards/page.tsx
// Admin page for managing River Hazards (dams, portages, strainers, rapids, etc.)

import { useState, useEffect, useCallback, useMemo } from 'react';
import { adminFetch } from '@/hooks/useAdminAuth';
import AdminLayout from '@/components/admin/AdminLayout';
import {
  AlertTriangle,
  Plus,
  Save,
  Trash2,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  Filter,
  X,
  ShieldAlert,
} from 'lucide-react';

interface Hazard {
  id: string;
  riverId: string | null;
  riverName: string | null;
  name: string;
  type: string;
  description: string | null;
  severity: string;
  portageRequired: boolean;
  portageSide: string | null;
  active: boolean;
  seasonalNotes: string | null;
  minSafeLevel: number | null;
  maxSafeLevel: number | null;
  latitude: number;
  longitude: number;
  riverMileDownstream: number | null;
  createdAt: string;
}

interface River {
  id: string;
  name: string;
}

const HAZARD_TYPES = [
  { value: 'low_water_dam', label: 'Low Water Dam' },
  { value: 'portage', label: 'Portage' },
  { value: 'strainer', label: 'Strainer' },
  { value: 'rapid', label: 'Rapid' },
  { value: 'private_property', label: 'Private Property' },
  { value: 'waterfall', label: 'Waterfall' },
  { value: 'shoal', label: 'Shoal' },
  { value: 'bridge_piling', label: 'Bridge Piling' },
  { value: 'other', label: 'Other' },
];

const SEVERITY_LEVELS = [
  { value: 'info', label: 'Info' },
  { value: 'caution', label: 'Caution' },
  { value: 'warning', label: 'Warning' },
  { value: 'danger', label: 'Danger' },
];

const PORTAGE_SIDES = [
  { value: '', label: 'N/A' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'either', label: 'Either' },
];

function getSeverityClasses(severity: string): string {
  switch (severity) {
    case 'info':
      return 'bg-blue-500/20 text-blue-400';
    case 'caution':
      return 'bg-yellow-500/20 text-yellow-400';
    case 'warning':
      return 'bg-orange-500/20 text-orange-400';
    case 'danger':
      return 'bg-red-500/20 text-red-400';
    default:
      return 'bg-neutral-600 text-neutral-400';
  }
}

function getTypeLabel(type: string): string {
  return HAZARD_TYPES.find(t => t.value === type)?.label || type;
}

function getSeverityLabel(severity: string): string {
  return SEVERITY_LEVELS.find(s => s.value === severity)?.label || severity;
}

export default function AdminHazardsPage() {
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [rivers, setRivers] = useState<River[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [expandedHazard, setExpandedHazard] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [page, setPage] = useState(1);
  const [totalHazards, setTotalHazards] = useState(0);
  const [pageLimit] = useState(50);
  const [newHazard, setNewHazard] = useState({
    name: '',
    type: 'other',
    severity: 'caution',
    riverId: '',
    latitude: '',
    longitude: '',
    description: '',
    portageRequired: false,
    portageSide: '',
  });

  const fetchHazards = useCallback(async (p: number = page) => {
    try {
      setLoading(true);
      const res = await adminFetch(`/api/admin/hazards?page=${p}&limit=${pageLimit}`);
      if (!res.ok) throw new Error('Failed to fetch hazards');
      const data = await res.json();
      setHazards(data.hazards);
      setTotalHazards(data.total ?? data.hazards.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [page, pageLimit]);

  const fetchRivers = useCallback(async () => {
    try {
      const res = await adminFetch('/api/rivers');
      if (!res.ok) return;
      const data = await res.json();
      setRivers(Array.isArray(data) ? data : data.rivers ?? []);
    } catch {
      // Rivers list is non-critical; silently ignore
    }
  }, []);

  useEffect(() => {
    fetchHazards(page);
  }, [page, fetchHazards]);

  useEffect(() => {
    fetchRivers();
  }, [fetchRivers]);

  const filteredHazards = useMemo(() => {
    let result = hazards;
    if (typeFilter !== 'all') {
      result = result.filter(h => h.type === typeFilter);
    }
    if (severityFilter !== 'all') {
      result = result.filter(h => h.severity === severityFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(h =>
        h.name.toLowerCase().includes(q) ||
        h.description?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [hazards, typeFilter, severityFilter, searchQuery]);

  const createHazard = async () => {
    if (!newHazard.name.trim()) return;
    const lat = parseFloat(newHazard.latitude);
    const lng = parseFloat(newHazard.longitude);
    if (isNaN(lat) || isNaN(lng)) {
      setError('Valid latitude and longitude are required');
      return;
    }

    try {
      setCreating(true);
      setError(null);
      const res = await adminFetch('/api/admin/hazards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newHazard.name.trim(),
          type: newHazard.type,
          severity: newHazard.severity,
          riverId: newHazard.riverId || null,
          latitude: lat,
          longitude: lng,
          description: newHazard.description || null,
          portageRequired: newHazard.portageRequired,
          portageSide: newHazard.portageSide || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create hazard');
      }
      setNewHazard({
        name: '',
        type: 'other',
        severity: 'caution',
        riverId: '',
        latitude: '',
        longitude: '',
        description: '',
        portageRequired: false,
        portageSide: '',
      });
      setShowCreate(false);
      setSuccessMessage('Hazard created');
      setTimeout(() => setSuccessMessage(null), 3000);
      await fetchHazards();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create hazard');
    } finally {
      setCreating(false);
    }
  };

  const deleteHazard = async (hazard: Hazard) => {
    if (!confirm(`Delete "${hazard.name}"? This cannot be undone.`)) return;
    try {
      setDeleting(hazard.id);
      const res = await adminFetch(`/api/admin/hazards/${hazard.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete');
      }
      setSuccessMessage(`Deleted ${hazard.name}`);
      setTimeout(() => setSuccessMessage(null), 3000);
      await fetchHazards();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <AdminLayout
      title="River Hazards"
      description="Manage dams, portages, strainers, rapids, and other river hazards"
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

        {/* Filters & Create */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-neutral-400" />
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="px-3 py-1.5 bg-neutral-800 border border-neutral-600 rounded-lg text-white text-sm"
            >
              <option value="all">All Types</option>
              {HAZARD_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <select
              value={severityFilter}
              onChange={e => setSeverityFilter(e.target.value)}
              className="px-3 py-1.5 bg-neutral-800 border border-neutral-600 rounded-lg text-white text-sm"
            >
              <option value="all">All Severities</option>
              {SEVERITY_LEVELS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
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
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm rounded-lg"
          >
            <Plus className="w-4 h-4" />
            New Hazard
          </button>
        </div>

        {/* Create Form */}
        {showCreate && (
          <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Create New Hazard</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-neutral-300 mb-1">Name *</label>
                <input
                  type="text"
                  value={newHazard.name}
                  onChange={e => setNewHazard({ ...newHazard, name: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white"
                  placeholder="e.g., Marble Creek Low Water Dam"
                />
              </div>
              <div>
                <label className="block text-sm text-neutral-300 mb-1">Type</label>
                <select
                  value={newHazard.type}
                  onChange={e => setNewHazard({ ...newHazard, type: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white"
                >
                  {HAZARD_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-neutral-300 mb-1">Severity</label>
                <select
                  value={newHazard.severity}
                  onChange={e => setNewHazard({ ...newHazard, severity: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white"
                >
                  {SEVERITY_LEVELS.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-neutral-300 mb-1">River</label>
                <select
                  value={newHazard.riverId}
                  onChange={e => setNewHazard({ ...newHazard, riverId: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white"
                >
                  <option value="">-- Select River --</option>
                  {rivers.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-neutral-300 mb-1">Latitude *</label>
                <input
                  type="number"
                  step="0.000001"
                  value={newHazard.latitude}
                  onChange={e => setNewHazard({ ...newHazard, latitude: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white"
                  placeholder="37.123456"
                />
              </div>
              <div>
                <label className="block text-sm text-neutral-300 mb-1">Longitude *</label>
                <input
                  type="number"
                  step="0.000001"
                  value={newHazard.longitude}
                  onChange={e => setNewHazard({ ...newHazard, longitude: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white"
                  placeholder="-91.123456"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-neutral-300 mb-1">Description</label>
                <textarea
                  value={newHazard.description}
                  onChange={e => setNewHazard({ ...newHazard, description: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white placeholder-neutral-500"
                  placeholder="Brief description of the hazard..."
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newHazard.portageRequired}
                    onChange={e => setNewHazard({ ...newHazard, portageRequired: e.target.checked })}
                    className="rounded border-neutral-600 bg-neutral-900 text-primary-600"
                  />
                  Portage Required
                </label>
              </div>
              <div>
                <label className="block text-sm text-neutral-300 mb-1">Portage Side</label>
                <select
                  value={newHazard.portageSide}
                  onChange={e => setNewHazard({ ...newHazard, portageSide: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white"
                >
                  {PORTAGE_SIDES.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={createHazard}
                disabled={creating || !newHazard.name.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm rounded-lg disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {creating ? 'Creating...' : 'Create Hazard'}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-neutral-400 hover:text-white text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Hazard List */}
        {loading ? (
          <div className="text-center py-12 text-neutral-400">Loading hazards...</div>
        ) : (
          <>
            <p className="text-sm text-neutral-400">
              {filteredHazards.length} of {hazards.length} hazards
            </p>
            <div className="space-y-2">
              {filteredHazards.map(hazard => (
                <div
                  key={hazard.id}
                  className="bg-neutral-800 rounded-lg border border-neutral-700 overflow-hidden"
                >
                  <div
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-neutral-750"
                    onClick={() => setExpandedHazard(expandedHazard === hazard.id ? null : hazard.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {expandedHazard === hazard.id ? (
                        <ChevronDown className="w-4 h-4 text-neutral-400 shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-neutral-400 shrink-0" />
                      )}
                      <ShieldAlert className="w-4 h-4 text-primary-400 shrink-0" />
                      <div className="min-w-0">
                        <h3 className="font-medium text-white truncate">{hazard.name}</h3>
                        <p className="text-xs text-neutral-400">
                          {getTypeLabel(hazard.type)}
                          {hazard.riverName && ` \u2022 ${hazard.riverName}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${getSeverityClasses(hazard.severity)}`}>
                        {getSeverityLabel(hazard.severity)}
                      </span>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${hazard.active ? 'bg-green-500/20 text-green-400' : 'bg-neutral-600 text-neutral-400'}`}>
                        {hazard.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>

                  {expandedHazard === hazard.id && (
                    <div className="border-t border-neutral-700 p-4 space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <span className="text-neutral-400 text-xs">Latitude</span>
                          <p className="text-white font-mono">{hazard.latitude.toFixed(6)}</p>
                        </div>
                        <div>
                          <span className="text-neutral-400 text-xs">Longitude</span>
                          <p className="text-white font-mono">{hazard.longitude.toFixed(6)}</p>
                        </div>
                        <div>
                          <span className="text-neutral-400 text-xs">River Mile</span>
                          <p className="text-white">{hazard.riverMileDownstream?.toFixed(1) ?? 'N/A'}</p>
                        </div>
                        <div>
                          <span className="text-neutral-400 text-xs">Portage Required</span>
                          <p className="text-white">{hazard.portageRequired ? 'Yes' : 'No'}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <span className="text-neutral-400 text-xs">Portage Side</span>
                          <p className="text-white">{hazard.portageSide ?? 'N/A'}</p>
                        </div>
                        <div>
                          <span className="text-neutral-400 text-xs">Min Safe Level</span>
                          <p className="text-white">{hazard.minSafeLevel ?? 'N/A'}</p>
                        </div>
                        <div>
                          <span className="text-neutral-400 text-xs">Max Safe Level</span>
                          <p className="text-white">{hazard.maxSafeLevel ?? 'N/A'}</p>
                        </div>
                        <div>
                          <span className="text-neutral-400 text-xs">Created</span>
                          <p className="text-white">{new Date(hazard.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                      {hazard.description && (
                        <div>
                          <span className="text-neutral-400 text-xs">Description</span>
                          <p className="text-white text-sm">{hazard.description}</p>
                        </div>
                      )}
                      {hazard.seasonalNotes && (
                        <div>
                          <span className="text-neutral-400 text-xs">Seasonal Notes</span>
                          <p className="text-white text-sm">{hazard.seasonalNotes}</p>
                        </div>
                      )}
                      <div className="flex justify-end pt-2">
                        <button
                          onClick={() => deleteHazard(hazard)}
                          disabled={deleting === hazard.id}
                          className="flex items-center gap-2 px-3 py-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg text-sm transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4" />
                          {deleting === hazard.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination Controls */}
            {totalHazards > pageLimit && (
              <div className="flex items-center justify-between pt-4">
                <p className="text-sm text-neutral-500">
                  Page {page} of {Math.ceil(totalHazards / pageLimit)} ({totalHazards} total)
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
                    disabled={page >= Math.ceil(totalHazards / pageLimit)}
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
