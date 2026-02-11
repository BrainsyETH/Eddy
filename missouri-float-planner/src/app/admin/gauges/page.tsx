'use client';

// src/app/admin/gauges/page.tsx
// Admin page for managing gauge thresholds and descriptions

import { useState, useEffect, useCallback, useMemo } from 'react';
import { adminFetch } from '@/hooks/useAdminAuth';
import AdminLayout from '@/components/admin/AdminLayout';
import {
  Activity,
  Save,
  ChevronDown,
  ChevronRight,
  Droplets,
  AlertTriangle,
  CheckCircle,
  Info,
  ExternalLink,
  Filter,
  X,
} from 'lucide-react';

interface ThresholdDescriptions {
  tooLow?: string;
  low?: string;
  okay?: string;
  optimal?: string;
  high?: string;
  flood?: string;
}

interface RiverAssociation {
  id: string;
  riverId: string;
  riverName: string;
  riverSlug: string;
  isPrimary: boolean;
  thresholdUnit: string;
  levelTooLow: number | null;
  levelLow: number | null;
  levelOptimalMin: number | null;
  levelOptimalMax: number | null;
  levelHigh: number | null;
  levelDangerous: number | null;
  altLevelTooLow: number | null;
  altLevelLow: number | null;
  altLevelOptimalMin: number | null;
  altLevelOptimalMax: number | null;
  altLevelHigh: number | null;
  altLevelDangerous: number | null;
  distanceFromSectionMiles: number | null;
  accuracyWarningThresholdMiles: number;
}

interface Gauge {
  id: string;
  usgsSiteId: string;
  name: string;
  active: boolean;
  thresholdDescriptions: ThresholdDescriptions | null;
  notes: string | null;
  riverAssociations: RiverAssociation[];
}

interface River {
  id: string;
  name: string;
  slug: string;
  floatSummary: string | null;
  floatTip: string | null;
  description: string | null;
  difficultyRating: string | null;
  region: string | null;
}

const THRESHOLD_LABELS = [
  { key: 'tooLow', label: 'Too Low', color: 'bg-gray-500' },
  { key: 'low', label: 'Low', color: 'bg-yellow-500' },
  { key: 'okay', label: 'Okay', color: 'bg-blue-500' },
  { key: 'optimal', label: 'Optimal', color: 'bg-green-500' },
  { key: 'high', label: 'High', color: 'bg-orange-500' },
  { key: 'flood', label: 'Flood', color: 'bg-red-500' },
];

export default function AdminGaugesPage() {
  const [gauges, setGauges] = useState<Gauge[]>([]);
  const [rivers, setRivers] = useState<River[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [expandedGauges, setExpandedGauges] = useState<Set<string>>(new Set());
  const [expandedRivers, setExpandedRivers] = useState<Set<string>>(new Set());
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedRiverFilter, setSelectedRiverFilter] = useState<string>('all');

  // Local edit state
  const [editedGauges, setEditedGauges] = useState<Map<string, Partial<Gauge>>>(new Map());
  const [editedRivers, setEditedRivers] = useState<Map<string, Partial<River>>>(new Map());
  const [editedAssociations, setEditedAssociations] = useState<Map<string, Partial<RiverAssociation>>>(new Map());

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      // Cache-bust to ensure fresh data after saves
      const response = await adminFetch(`/api/admin/gauges?_t=${Date.now()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch gauges');
      }
      const data = await response.json();
      setGauges(data.gauges);
      setRivers(data.rivers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleGauge = (gaugeId: string) => {
    setExpandedGauges(prev => {
      const next = new Set(prev);
      if (next.has(gaugeId)) {
        next.delete(gaugeId);
      } else {
        next.add(gaugeId);
      }
      return next;
    });
  };

  const toggleRiver = (riverId: string) => {
    setExpandedRivers(prev => {
      const next = new Set(prev);
      if (next.has(riverId)) {
        next.delete(riverId);
      } else {
        next.add(riverId);
      }
      return next;
    });
  };

  const updateGaugeField = (gaugeId: string, field: keyof Gauge, value: unknown) => {
    setEditedGauges(prev => {
      const next = new Map(prev);
      const current = next.get(gaugeId) || {};
      next.set(gaugeId, { ...current, [field]: value });
      return next;
    });
  };

  const updateThresholdDescription = (gaugeId: string, key: string, value: string) => {
    setEditedGauges(prev => {
      const next = new Map(prev);
      const current = next.get(gaugeId) || {};
      const gauge = gauges.find(g => g.id === gaugeId);
      const currentDescriptions = (current.thresholdDescriptions as ThresholdDescriptions) ||
        gauge?.thresholdDescriptions || {};
      next.set(gaugeId, {
        ...current,
        thresholdDescriptions: { ...currentDescriptions, [key]: value },
      });
      return next;
    });
  };

  const updateAssociationField = (assocId: string, field: keyof RiverAssociation, value: unknown) => {
    setEditedAssociations(prev => {
      const next = new Map(prev);
      const current = next.get(assocId) || {};
      next.set(assocId, { ...current, [field]: value });
      return next;
    });
  };

  // When toggling the unit, swap primary (level_*) and alt (alt_level_*) values
  // so that level_* always stores thresholds in the selected unit.
  const handleUnitToggle = (assocId: string, newUnit: string) => {
    const currentUnit = getAssocDisplayValue<string>(assocId, 'thresholdUnit', 'ft');
    if (newUnit === currentUnit) return;

    // Read current effective values (edited or original)
    const pTooLow = getAssocDisplayValue<number | null>(assocId, 'levelTooLow', null);
    const pLow = getAssocDisplayValue<number | null>(assocId, 'levelLow', null);
    const pOptMin = getAssocDisplayValue<number | null>(assocId, 'levelOptimalMin', null);
    const pOptMax = getAssocDisplayValue<number | null>(assocId, 'levelOptimalMax', null);
    const pHigh = getAssocDisplayValue<number | null>(assocId, 'levelHigh', null);
    const pDangerous = getAssocDisplayValue<number | null>(assocId, 'levelDangerous', null);

    const aTooLow = getAssocDisplayValue<number | null>(assocId, 'altLevelTooLow', null);
    const aLow = getAssocDisplayValue<number | null>(assocId, 'altLevelLow', null);
    const aOptMin = getAssocDisplayValue<number | null>(assocId, 'altLevelOptimalMin', null);
    const aOptMax = getAssocDisplayValue<number | null>(assocId, 'altLevelOptimalMax', null);
    const aHigh = getAssocDisplayValue<number | null>(assocId, 'altLevelHigh', null);
    const aDangerous = getAssocDisplayValue<number | null>(assocId, 'altLevelDangerous', null);

    // Swap: old primary → new alt, old alt → new primary
    setEditedAssociations(prev => {
      const next = new Map(prev);
      next.set(assocId, {
        ...(next.get(assocId) || {}),
        thresholdUnit: newUnit,
        levelTooLow: aTooLow,
        levelLow: aLow,
        levelOptimalMin: aOptMin,
        levelOptimalMax: aOptMax,
        levelHigh: aHigh,
        levelDangerous: aDangerous,
        altLevelTooLow: pTooLow,
        altLevelLow: pLow,
        altLevelOptimalMin: pOptMin,
        altLevelOptimalMax: pOptMax,
        altLevelHigh: pHigh,
        altLevelDangerous: pDangerous,
      });
      return next;
    });
  };

  const updateRiverField = (riverId: string, field: keyof River, value: unknown) => {
    setEditedRivers(prev => {
      const next = new Map(prev);
      const current = next.get(riverId) || {};
      next.set(riverId, { ...current, [field]: value });
      return next;
    });
  };

  const saveGauge = async (gauge: Gauge) => {
    const edits = editedGauges.get(gauge.id) || {};
    const assocEdits: Partial<RiverAssociation>[] = [];

    // Collect association edits for this gauge
    for (const assoc of gauge.riverAssociations) {
      const assocEdit = editedAssociations.get(assoc.id);
      if (assocEdit) {
        assocEdits.push({ id: assoc.id, riverName: assoc.riverName, ...assocEdit });
      }
    }

    if (Object.keys(edits).length === 0 && assocEdits.length === 0) {
      return; // Nothing to save
    }

    try {
      setSaving(gauge.id);
      setError(null);

      const response = await adminFetch(`/api/admin/gauges/${gauge.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...edits,
          riverAssociations: assocEdits.length > 0 ? assocEdits : undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save');
      }

      // Clear edits and refresh
      setEditedGauges(prev => {
        const next = new Map(prev);
        next.delete(gauge.id);
        return next;
      });

      for (const assoc of gauge.riverAssociations) {
        setEditedAssociations(prev => {
          const next = new Map(prev);
          next.delete(assoc.id);
          return next;
        });
      }

      setSuccessMessage(`Saved ${gauge.name}`);
      setTimeout(() => setSuccessMessage(null), 3000);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(null);
    }
  };

  const saveRiver = async (river: River) => {
    const edits = editedRivers.get(river.id);
    if (!edits || Object.keys(edits).length === 0) {
      return;
    }

    try {
      setSaving(river.id);
      setError(null);

      const response = await adminFetch(`/api/admin/rivers/${river.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(edits),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save');
      }

      setEditedRivers(prev => {
        const next = new Map(prev);
        next.delete(river.id);
        return next;
      });

      setSuccessMessage(`Saved ${river.name}`);
      setTimeout(() => setSuccessMessage(null), 3000);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(null);
    }
  };

  const hasGaugeChanges = (gaugeId: string) => {
    if (editedGauges.has(gaugeId)) return true;
    const gauge = gauges.find(g => g.id === gaugeId);
    if (!gauge) return false;
    return gauge.riverAssociations.some(a => editedAssociations.has(a.id));
  };

  const getDisplayValue = <T,>(gaugeId: string, field: keyof Gauge, fallback: T): T => {
    const edits = editedGauges.get(gaugeId);
    if (edits && field in edits) {
      return edits[field] as T;
    }
    const gauge = gauges.find(g => g.id === gaugeId);
    return (gauge?.[field] as T) ?? fallback;
  };

  const getAssocDisplayValue = <T,>(assocId: string, field: keyof RiverAssociation, fallback: T): T => {
    const edits = editedAssociations.get(assocId);
    if (edits && field in edits) {
      return edits[field] as T;
    }
    // Find in gauges
    for (const gauge of gauges) {
      const assoc = gauge.riverAssociations.find(a => a.id === assocId);
      if (assoc) {
        return (assoc[field] as T) ?? fallback;
      }
    }
    return fallback;
  };

  const getRiverDisplayValue = <T,>(riverId: string, field: keyof River, fallback: T): T => {
    const edits = editedRivers.get(riverId);
    if (edits && field in edits) {
      return edits[field] as T;
    }
    const river = rivers.find(r => r.id === riverId);
    return (river?.[field] as T) ?? fallback;
  };

  // Get unique rivers from gauge associations for the filter dropdown
  const riverOptions = useMemo(() => {
    const riverMap = new Map<string, string>();
    gauges.forEach(gauge => {
      gauge.riverAssociations.forEach(assoc => {
        if (assoc.riverId && assoc.riverName) {
          riverMap.set(assoc.riverId, assoc.riverName);
        }
      });
    });
    return Array.from(riverMap.entries())
      .sort((a, b) => a[1].localeCompare(b[1]));
  }, [gauges]);

  // Filter and sort gauges by river
  const filteredGauges = useMemo(() => {
    let result = gauges;

    // Filter by selected river
    if (selectedRiverFilter !== 'all') {
      result = result.filter(gauge =>
        gauge.riverAssociations.some(assoc => assoc.riverId === selectedRiverFilter)
      );
    }

    // Sort: gauges with selected river as primary first, then by name
    return result.sort((a, b) => {
      if (selectedRiverFilter !== 'all') {
        const aIsPrimary = a.riverAssociations.some(
          assoc => assoc.riverId === selectedRiverFilter && assoc.isPrimary
        );
        const bIsPrimary = b.riverAssociations.some(
          assoc => assoc.riverId === selectedRiverFilter && assoc.isPrimary
        );
        if (aIsPrimary && !bIsPrimary) return -1;
        if (!aIsPrimary && bIsPrimary) return 1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [gauges, selectedRiverFilter]);

  // Get the selected river name for display
  const selectedRiverName = useMemo(() => {
    if (selectedRiverFilter === 'all') return null;
    const river = riverOptions.find(([id]) => id === selectedRiverFilter);
    return river ? river[1] : null;
  }, [selectedRiverFilter, riverOptions]);

  return (
    <AdminLayout
      title="Gauge Thresholds"
      description="Manage water level thresholds and descriptions for each gauge"
    >
      <div className="p-6 space-y-6 max-w-6xl">
        {error && (
          <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-200 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            {error}
          </div>
        )}

        {successMessage && (
          <div className="p-4 bg-green-500/20 border border-green-500/50 rounded-lg text-green-200 flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            {successMessage}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-neutral-400">Loading gauges...</div>
        ) : (
          <>
            {/* Gauges Section */}
            <section>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  Gauge Stations ({filteredGauges.length}{selectedRiverFilter !== 'all' ? ` of ${gauges.length}` : ''})
                </h2>

                {/* River Filter */}
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-neutral-400" />
                  <select
                    value={selectedRiverFilter}
                    onChange={(e) => setSelectedRiverFilter(e.target.value)}
                    className="px-3 py-1.5 bg-neutral-800 border border-neutral-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="all">All Rivers</option>
                    {riverOptions.map(([id, name]) => (
                      <option key={id} value={id}>{name}</option>
                    ))}
                  </select>
                  {selectedRiverFilter !== 'all' && (
                    <button
                      onClick={() => setSelectedRiverFilter('all')}
                      className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-700 rounded-lg transition-colors"
                      title="Clear filter"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Selected river info banner */}
              {selectedRiverName && (
                <div className="mb-4 p-3 bg-primary-900/30 border border-primary-700/50 rounded-lg">
                  <p className="text-sm text-primary-200">
                    Showing gauges associated with <strong className="text-white">{selectedRiverName}</strong>.
                    Primary gauges for this river are shown first.
                  </p>
                </div>
              )}

              <div className="space-y-4">
                {filteredGauges.map(gauge => (
                  <div
                    key={gauge.id}
                    className="bg-neutral-800 rounded-lg border border-neutral-700 overflow-hidden"
                  >
                    {/* Gauge header */}
                    <div
                      className="p-4 flex items-center justify-between cursor-pointer hover:bg-neutral-750"
                      onClick={() => toggleGauge(gauge.id)}
                    >
                      <div className="flex items-center gap-3">
                        {expandedGauges.has(gauge.id) ? (
                          <ChevronDown className="w-5 h-5 text-neutral-400" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-neutral-400" />
                        )}
                        <div>
                          <h3 className="font-semibold text-white">{gauge.name}</h3>
                          <p className="text-sm text-neutral-400">
                            USGS {gauge.usgsSiteId} • {gauge.riverAssociations.length} river(s)
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {hasGaugeChanges(gauge.id) && (
                          <span className="text-xs text-yellow-400">Unsaved changes</span>
                        )}
                        <a
                          href={`https://waterdata.usgs.gov/nwis/uv?site_no=${gauge.usgsSiteId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-700 rounded-lg"
                          title="View on USGS"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            saveGauge(gauge);
                          }}
                          disabled={saving === gauge.id || !hasGaugeChanges(gauge.id)}
                          className="flex items-center gap-2 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-sm rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Save className="w-4 h-4" />
                          {saving === gauge.id ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </div>

                    {/* Gauge details */}
                    {expandedGauges.has(gauge.id) && (
                      <div className="border-t border-neutral-700 p-4 space-y-6">
                        {/* Notes */}
                        <div>
                          <label className="block text-sm font-medium text-neutral-300 mb-2">
                            Admin Notes
                          </label>
                          <textarea
                            value={getDisplayValue(gauge.id, 'notes', '') || ''}
                            onChange={e => updateGaugeField(gauge.id, 'notes', e.target.value)}
                            rows={2}
                            className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                            placeholder="Notes about this gauge (datum issues, local knowledge, etc.)"
                          />
                        </div>

                        {/* Threshold Descriptions */}
                        <div>
                          <h4 className="text-sm font-medium text-neutral-300 mb-3">
                            Threshold Descriptions (shown to users)
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {THRESHOLD_LABELS.map(({ key, label, color }) => {
                              const descriptions = getDisplayValue<ThresholdDescriptions | null>(
                                gauge.id,
                                'thresholdDescriptions',
                                null
                              ) || {};
                              return (
                                <div key={key} className="flex items-start gap-3">
                                  <div className={`w-3 h-3 rounded-full ${color} mt-2.5`} />
                                  <div className="flex-1">
                                    <label className="block text-xs text-neutral-400 mb-1">
                                      {label}
                                    </label>
                                    <input
                                      type="text"
                                      value={(descriptions as Record<string, string>)[key] || ''}
                                      onChange={e => updateThresholdDescription(gauge.id, key, e.target.value)}
                                      className="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                                      placeholder={`Description for ${label.toLowerCase()} water...`}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* River Associations (Thresholds) */}
                        {gauge.riverAssociations.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium text-neutral-300 mb-3">
                              Water Level Thresholds by River
                            </h4>
                            {gauge.riverAssociations.map(assoc => (
                              <div
                                key={assoc.id}
                                className="bg-neutral-900 rounded-lg p-4 mb-3 border border-neutral-700"
                              >
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center gap-2">
                                    <Droplets className="w-4 h-4 text-primary-400" />
                                    <span className="font-medium text-white">{assoc.riverName}</span>
                                    {assoc.isPrimary && (
                                      <span className="px-2 py-0.5 text-xs bg-primary-600/30 text-primary-300 rounded-full">
                                        Primary
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm text-neutral-400">Default unit:</span>
                                    <div className="flex rounded-lg overflow-hidden border border-neutral-600">
                                      {(['ft', 'cfs'] as const).map(unit => {
                                        const currentUnit = getAssocDisplayValue<string>(assoc.id, 'thresholdUnit', 'ft');
                                        const isActive = currentUnit === unit;
                                        return (
                                          <button
                                            key={unit}
                                            type="button"
                                            onClick={() => handleUnitToggle(assoc.id, unit)}
                                            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                                              isActive
                                                ? 'bg-primary-600 text-white'
                                                : 'bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700'
                                            }`}
                                          >
                                            {unit === 'ft' ? 'ft (gauge height)' : 'cfs (discharge)'}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>

                                {(() => {
                                  const currentUnit = getAssocDisplayValue<string>(assoc.id, 'thresholdUnit', 'ft');
                                  const unitLabel = currentUnit === 'cfs' ? 'cfs' : 'ft';
                                  const stepSize = currentUnit === 'cfs' ? '1' : '0.1';

                                  const altUnitLabel = currentUnit === 'cfs' ? 'ft' : 'cfs';
                                  const altStepSize = currentUnit === 'cfs' ? '0.1' : '1';

                                  return (
                                    <>
                                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                                        {[
                                          { field: 'levelTooLow', label: 'Too Low', color: 'border-gray-500' },
                                          { field: 'levelLow', label: 'Low', color: 'border-yellow-500' },
                                          { field: 'levelOptimalMin', label: 'Optimal Min', color: 'border-green-500' },
                                          { field: 'levelOptimalMax', label: 'Optimal Max', color: 'border-green-500' },
                                          { field: 'levelHigh', label: 'High', color: 'border-orange-500' },
                                          { field: 'levelDangerous', label: 'Flood', color: 'border-red-500' },
                                        ].map(({ field, label, color }) => (
                                          <div key={field}>
                                            <label className="block text-xs text-neutral-400 mb-1">{label} ({unitLabel})</label>
                                            <input
                                              type="number"
                                              step={stepSize}
                                              value={getAssocDisplayValue(assoc.id, field as keyof RiverAssociation, '') ?? ''}
                                              onChange={e => updateAssociationField(assoc.id, field as keyof RiverAssociation, e.target.value)}
                                              className={`w-full px-2 py-1.5 bg-neutral-800 border-l-4 ${color} border-y border-r border-neutral-600 rounded text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500`}
                                              placeholder="—"
                                            />
                                          </div>
                                        ))}
                                      </div>

                                      {/* Alternate unit thresholds (shown when user toggles unit on the site) */}
                                      <p className="text-xs text-neutral-500 mt-4 mb-2">Alternate unit — {altUnitLabel === 'cfs' ? 'cfs (discharge)' : 'ft (gauge height)'} <span className="text-neutral-600">(optional, enables unit toggle on site)</span></p>
                                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                                        {[
                                          { field: 'altLevelTooLow', label: 'Too Low', color: 'border-gray-500' },
                                          { field: 'altLevelLow', label: 'Low', color: 'border-yellow-500' },
                                          { field: 'altLevelOptimalMin', label: 'Optimal Min', color: 'border-green-500' },
                                          { field: 'altLevelOptimalMax', label: 'Optimal Max', color: 'border-green-500' },
                                          { field: 'altLevelHigh', label: 'High', color: 'border-orange-500' },
                                          { field: 'altLevelDangerous', label: 'Flood', color: 'border-red-500' },
                                        ].map(({ field, label, color }) => (
                                          <div key={field}>
                                            <label className="block text-xs text-neutral-400 mb-1">{label} ({altUnitLabel})</label>
                                            <input
                                              type="number"
                                              step={altStepSize}
                                              value={getAssocDisplayValue(assoc.id, field as keyof RiverAssociation, '') ?? ''}
                                              onChange={e => updateAssociationField(assoc.id, field as keyof RiverAssociation, e.target.value)}
                                              className={`w-full px-2 py-1.5 bg-neutral-800 border-l-4 ${color} border-y border-r border-neutral-600 rounded text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500`}
                                              placeholder="—"
                                            />
                                          </div>
                                        ))}
                                      </div>
                                    </>
                                  );
                                })()}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* River Summaries Section */}
            <section className="mt-8">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <Info className="w-5 h-5" />
                River Floating Summaries
              </h2>
              <p className="text-neutral-400 text-sm mb-4">
                General floating information and tips shown on the gauges page.
              </p>

              <div className="space-y-4">
                {rivers.map(river => (
                  <div
                    key={river.id}
                    className="bg-neutral-800 rounded-lg border border-neutral-700 overflow-hidden"
                  >
                    <div
                      className="p-4 flex items-center justify-between cursor-pointer hover:bg-neutral-750"
                      onClick={() => toggleRiver(river.id)}
                    >
                      <div className="flex items-center gap-3">
                        {expandedRivers.has(river.id) ? (
                          <ChevronDown className="w-5 h-5 text-neutral-400" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-neutral-400" />
                        )}
                        <h3 className="font-semibold text-white">{river.name}</h3>
                      </div>
                      <div className="flex items-center gap-3">
                        {editedRivers.has(river.id) && (
                          <span className="text-xs text-yellow-400">Unsaved changes</span>
                        )}
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            saveRiver(river);
                          }}
                          disabled={saving === river.id || !editedRivers.has(river.id)}
                          className="flex items-center gap-2 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-sm rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Save className="w-4 h-4" />
                          {saving === river.id ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </div>

                    {expandedRivers.has(river.id) && (
                      <div className="border-t border-neutral-700 p-4 space-y-4">
                        {/* River Metadata */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-neutral-300 mb-2">
                              Difficulty Rating
                            </label>
                            <select
                              value={getRiverDisplayValue(river.id, 'difficultyRating', '') || ''}
                              onChange={e => updateRiverField(river.id, 'difficultyRating', e.target.value)}
                              className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                            >
                              <option value="">Not set</option>
                              <option value="Class I">Class I</option>
                              <option value="Class I-II">Class I-II</option>
                              <option value="Class II">Class II</option>
                              <option value="Class II-III">Class II-III</option>
                              <option value="Class III">Class III</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-neutral-300 mb-2">
                              Region
                            </label>
                            <select
                              value={getRiverDisplayValue(river.id, 'region', '') || ''}
                              onChange={e => updateRiverField(river.id, 'region', e.target.value)}
                              className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                            >
                              <option value="">Not set</option>
                              <option value="Ozarks">Ozarks</option>
                              <option value="Central Missouri">Central Missouri</option>
                              <option value="Southeast Missouri">Southeast Missouri</option>
                              <option value="Southwest Missouri">Southwest Missouri</option>
                              <option value="Northwest Missouri">Northwest Missouri</option>
                              <option value="Northeast Missouri">Northeast Missouri</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-neutral-300 mb-2">
                            River Description
                          </label>
                          <textarea
                            value={getRiverDisplayValue(river.id, 'description', '') || ''}
                            onChange={e => updateRiverField(river.id, 'description', e.target.value)}
                            rows={3}
                            className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                            placeholder="General description of the river (scenery, character, highlights)..."
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-neutral-300 mb-2">
                            Float Summary
                          </label>
                          <textarea
                            value={getRiverDisplayValue(river.id, 'floatSummary', '') || ''}
                            onChange={e => updateRiverField(river.id, 'floatSummary', e.target.value)}
                            rows={4}
                            className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                            placeholder="General floating information and gauge interpretation for this river..."
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-neutral-300 mb-2">
                            Float Tip
                          </label>
                          <textarea
                            value={getRiverDisplayValue(river.id, 'floatTip', '') || ''}
                            onChange={e => updateRiverField(river.id, 'floatTip', e.target.value)}
                            rows={2}
                            className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                            placeholder="Quick tip or safety note..."
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
