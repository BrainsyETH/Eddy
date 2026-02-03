'use client';

// src/app/admin/gauges/page.tsx
// Admin page for managing gauge thresholds and descriptions

import { useState, useEffect, useCallback } from 'react';
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

  // Local edit state
  const [editedGauges, setEditedGauges] = useState<Map<string, Partial<Gauge>>>(new Map());
  const [editedRivers, setEditedRivers] = useState<Map<string, Partial<River>>>(new Map());
  const [editedAssociations, setEditedAssociations] = useState<Map<string, Partial<RiverAssociation>>>(new Map());

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/gauges');
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

      const response = await fetch(`/api/admin/gauges/${gauge.id}`, {
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

      const response = await fetch(`/api/admin/rivers/${river.id}`, {
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
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Gauge Stations ({gauges.length})
              </h2>

              <div className="space-y-4">
                {gauges.map(gauge => (
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
                                    <span className="text-sm text-neutral-400">Unit:</span>
                                    <select
                                      value={getAssocDisplayValue(assoc.id, 'thresholdUnit', 'ft')}
                                      onChange={e => updateAssociationField(assoc.id, 'thresholdUnit', e.target.value)}
                                      className="px-2 py-1 bg-neutral-800 border border-neutral-600 rounded text-sm text-white"
                                    >
                                      <option value="ft">ft (gauge height)</option>
                                      <option value="cfs">cfs (discharge)</option>
                                    </select>
                                  </div>
                                </div>

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
                                      <label className="block text-xs text-neutral-400 mb-1">{label}</label>
                                      <input
                                        type="number"
                                        step="0.1"
                                        value={getAssocDisplayValue(assoc.id, field as keyof RiverAssociation, '') ?? ''}
                                        onChange={e => updateAssociationField(assoc.id, field as keyof RiverAssociation, e.target.value)}
                                        className={`w-full px-2 py-1.5 bg-neutral-800 border-l-4 ${color} border-y border-r border-neutral-600 rounded text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500`}
                                        placeholder="—"
                                      />
                                    </div>
                                  ))}
                                </div>
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
