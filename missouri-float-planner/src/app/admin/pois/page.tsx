'use client';

// src/app/admin/pois/page.tsx
// Admin page for managing Points of Interest (springs, caves, campgrounds, etc.)

import { useState, useEffect, useCallback, useMemo } from 'react';
import { adminFetch } from '@/hooks/useAdminAuth';
import AdminLayout from '@/components/admin/AdminLayout';
import {
  MapPin,
  Plus,
  Save,
  Trash2,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  Filter,
  X,
  ExternalLink,
} from 'lucide-react';

interface POI {
  id: string;
  riverId: string | null;
  riverName: string | null;
  name: string;
  slug: string;
  description: string | null;
  bodyText: string | null;
  type: string;
  source: string;
  npsId: string | null;
  npsUrl: string | null;
  latitude: number;
  longitude: number;
  riverMile: number | null;
  images: string[];
  amenities: string[];
  active: boolean;
  isOnWater: boolean;
  createdAt: string;
}

const POI_TYPES = [
  { value: 'spring', label: 'Spring' },
  { value: 'cave', label: 'Cave' },
  { value: 'historical_site', label: 'Historical Site' },
  { value: 'scenic_viewpoint', label: 'Scenic Viewpoint' },
  { value: 'waterfall', label: 'Waterfall' },
  { value: 'geological', label: 'Geological' },
  { value: 'campground', label: 'Campground' },
  { value: 'float_camp', label: 'Float Camp' },
  { value: 'other', label: 'Other' },
];

export default function AdminPOIsPage() {
  const [pois, setPois] = useState<POI[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [expandedPOI, setExpandedPOI] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [riverFilter, setRiverFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newPOI, setNewPOI] = useState({
    name: '',
    type: 'other',
    latitude: '',
    longitude: '',
    description: '',
  });

  const fetchPOIs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await adminFetch('/api/admin/pois');
      if (!res.ok) throw new Error('Failed to fetch POIs');
      const data = await res.json();
      setPois(data.pois);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPOIs();
  }, [fetchPOIs]);

  const riverOptions = useMemo(() => {
    const map = new Map<string, string>();
    pois.forEach(poi => {
      if (poi.riverId && poi.riverName) {
        map.set(poi.riverId, poi.riverName);
      }
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [pois]);

  const filteredPOIs = useMemo(() => {
    let result = pois;
    if (typeFilter !== 'all') {
      result = result.filter(p => p.type === typeFilter);
    }
    if (riverFilter !== 'all') {
      result = result.filter(p => p.riverId === riverFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [pois, typeFilter, riverFilter, searchQuery]);

  const createPOI = async () => {
    if (!newPOI.name.trim()) return;
    const lat = parseFloat(newPOI.latitude);
    const lng = parseFloat(newPOI.longitude);
    if (isNaN(lat) || isNaN(lng)) {
      setError('Valid latitude and longitude are required');
      return;
    }

    try {
      setCreating(true);
      setError(null);
      const res = await adminFetch('/api/admin/pois', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newPOI.name.trim(),
          type: newPOI.type,
          latitude: lat,
          longitude: lng,
          description: newPOI.description || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create POI');
      }
      setNewPOI({ name: '', type: 'other', latitude: '', longitude: '', description: '' });
      setShowCreate(false);
      setSuccessMessage('POI created');
      setTimeout(() => setSuccessMessage(null), 3000);
      await fetchPOIs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create POI');
    } finally {
      setCreating(false);
    }
  };

  const deletePOI = async (poi: POI) => {
    if (!confirm(`Delete "${poi.name}"? This cannot be undone.`)) return;
    try {
      setDeleting(poi.id);
      const res = await adminFetch(`/api/admin/pois/${poi.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete');
      }
      setSuccessMessage(`Deleted ${poi.name}`);
      setTimeout(() => setSuccessMessage(null), 3000);
      await fetchPOIs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleting(null);
    }
  };

  const getTypeLabel = (type: string) => POI_TYPES.find(t => t.value === type)?.label || type;

  return (
    <AdminLayout
      title="Points of Interest"
      description="Manage springs, caves, campgrounds, and other points of interest"
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
              {POI_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <select
              value={riverFilter}
              onChange={e => setRiverFilter(e.target.value)}
              className="px-3 py-1.5 bg-neutral-800 border border-neutral-600 rounded-lg text-white text-sm"
            >
              <option value="all">All Rivers</option>
              {riverOptions.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
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
            New POI
          </button>
        </div>

        {/* Create Form */}
        {showCreate && (
          <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Create New POI</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-neutral-300 mb-1">Name *</label>
                <input
                  type="text"
                  value={newPOI.name}
                  onChange={e => setNewPOI({ ...newPOI, name: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white"
                  placeholder="e.g., Blue Spring"
                />
              </div>
              <div>
                <label className="block text-sm text-neutral-300 mb-1">Type</label>
                <select
                  value={newPOI.type}
                  onChange={e => setNewPOI({ ...newPOI, type: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white"
                >
                  {POI_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-neutral-300 mb-1">Latitude *</label>
                <input
                  type="number"
                  step="0.000001"
                  value={newPOI.latitude}
                  onChange={e => setNewPOI({ ...newPOI, latitude: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white"
                  placeholder="37.123456"
                />
              </div>
              <div>
                <label className="block text-sm text-neutral-300 mb-1">Longitude *</label>
                <input
                  type="number"
                  step="0.000001"
                  value={newPOI.longitude}
                  onChange={e => setNewPOI({ ...newPOI, longitude: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white"
                  placeholder="-91.123456"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-neutral-300 mb-1">Description</label>
                <textarea
                  value={newPOI.description}
                  onChange={e => setNewPOI({ ...newPOI, description: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white placeholder-neutral-500"
                  placeholder="Brief description..."
                />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={createPOI}
                disabled={creating || !newPOI.name.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm rounded-lg disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {creating ? 'Creating...' : 'Create POI'}
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

        {/* POI List */}
        {loading ? (
          <div className="text-center py-12 text-neutral-400">Loading POIs...</div>
        ) : (
          <>
            <p className="text-sm text-neutral-400">
              {filteredPOIs.length} of {pois.length} points of interest
            </p>
            <div className="space-y-2">
              {filteredPOIs.map(poi => (
                <div
                  key={poi.id}
                  className="bg-neutral-800 rounded-lg border border-neutral-700 overflow-hidden"
                >
                  <div
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-neutral-750"
                    onClick={() => setExpandedPOI(expandedPOI === poi.id ? null : poi.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {expandedPOI === poi.id ? (
                        <ChevronDown className="w-4 h-4 text-neutral-400 shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-neutral-400 shrink-0" />
                      )}
                      <MapPin className="w-4 h-4 text-primary-400 shrink-0" />
                      <div className="min-w-0">
                        <h3 className="font-medium text-white truncate">{poi.name}</h3>
                        <p className="text-xs text-neutral-400">
                          {getTypeLabel(poi.type)}
                          {poi.riverName && ` \u2022 ${poi.riverName}`}
                          {poi.source !== 'manual' && ` \u2022 ${poi.source}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${poi.active ? 'bg-green-500/20 text-green-400' : 'bg-neutral-600 text-neutral-400'}`}>
                        {poi.active ? 'Active' : 'Inactive'}
                      </span>
                      {poi.npsUrl && (
                        <a
                          href={poi.npsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="p-1.5 text-neutral-400 hover:text-white"
                          title="View on NPS"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>

                  {expandedPOI === poi.id && (
                    <div className="border-t border-neutral-700 p-4 space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <span className="text-neutral-400 text-xs">Latitude</span>
                          <p className="text-white font-mono">{poi.latitude.toFixed(6)}</p>
                        </div>
                        <div>
                          <span className="text-neutral-400 text-xs">Longitude</span>
                          <p className="text-white font-mono">{poi.longitude.toFixed(6)}</p>
                        </div>
                        <div>
                          <span className="text-neutral-400 text-xs">River Mile</span>
                          <p className="text-white">{poi.riverMile?.toFixed(1) ?? 'N/A'}</p>
                        </div>
                        <div>
                          <span className="text-neutral-400 text-xs">On Water</span>
                          <p className="text-white">{poi.isOnWater ? 'Yes' : 'No'}</p>
                        </div>
                      </div>
                      {poi.description && (
                        <div>
                          <span className="text-neutral-400 text-xs">Description</span>
                          <p className="text-white text-sm">{poi.description}</p>
                        </div>
                      )}
                      {poi.amenities.length > 0 && (
                        <div>
                          <span className="text-neutral-400 text-xs">Amenities</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {poi.amenities.map(a => (
                              <span key={a} className="px-2 py-0.5 bg-neutral-700 text-neutral-200 text-xs rounded">
                                {a}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {poi.images.length > 0 && (
                        <div>
                          <span className="text-neutral-400 text-xs">Images ({poi.images.length})</span>
                          <div className="flex gap-2 mt-1 overflow-x-auto">
                            {poi.images.slice(0, 4).map((url, i) => (
                              <img key={i} src={url} alt="" className="w-16 h-16 object-cover rounded" />
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="flex justify-end pt-2">
                        <button
                          onClick={() => deletePOI(poi)}
                          disabled={deleting === poi.id}
                          className="flex items-center gap-2 px-3 py-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg text-sm transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4" />
                          {deleting === poi.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
