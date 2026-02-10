'use client';

// src/app/admin/data-sync/page.tsx
// Admin page for triggering and reviewing USFS/RIDB data syncs.
// Synced campgrounds arrive as pending POIs (active=false).
// Admins can activate them or promote them to access points.

import { useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { adminFetch } from '@/hooks/useAdminAuth';
import { RefreshCw, Eye, Download, CheckCircle, XCircle, AlertTriangle, ExternalLink, MapPin, ArrowUpRight } from 'lucide-react';

interface SyncFacility {
  facilityId: string;
  name: string;
  type: string;
  lat: number;
  lng: number;
  isCampground: boolean;
  isUSFS: boolean;
  reservable: boolean;
  feeDescription: string;
  description: string;
  reservationUrl: string | null;
  activities: string[];
  nearestRiver: string;
  outcome?: string;
}

interface SyncResult {
  message: string;
  dryRun: boolean;
  durationMs: number;
  facilitiesFetched: number;
  facilitiesFiltered: number;
  campgroundsSynced: number;
  campgroundsMatched: number;
  poisCreated: number;
  poisUpdated: number;
  errors: number;
  errorDetails: string[];
  facilities: SyncFacility[];
}

function OutcomeBadge({ outcome }: { outcome?: string }) {
  if (!outcome) return null;

  if (outcome === 'created') {
    return <span className="px-2 py-0.5 text-xs rounded-full bg-green-900 text-green-300">Created (Pending)</span>;
  }
  if (outcome === 'updated') {
    return <span className="px-2 py-0.5 text-xs rounded-full bg-blue-900 text-blue-300">Updated</span>;
  }
  if (outcome === 'matched') {
    return <span className="px-2 py-0.5 text-xs rounded-full bg-purple-900 text-purple-300">Matched</span>;
  }
  if (outcome.startsWith('dry run')) {
    return <span className="px-2 py-0.5 text-xs rounded-full bg-yellow-900 text-yellow-300">Would Sync</span>;
  }
  if (outcome.startsWith('skipped')) {
    return <span className="px-2 py-0.5 text-xs rounded-full bg-neutral-700 text-neutral-400">Skipped</span>;
  }
  if (outcome.startsWith('error')) {
    return <span className="px-2 py-0.5 text-xs rounded-full bg-red-900 text-red-300">Error</span>;
  }
  return <span className="px-2 py-0.5 text-xs rounded-full bg-neutral-700 text-neutral-400">{outcome}</span>;
}

export default function DataSyncPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [promoteResults, setPromoteResults] = useState<Record<string, string>>({});

  async function runSync(dryRun: boolean) {
    setLoading(true);
    setError(null);
    setResult(null);
    setPromoteResults({});

    try {
      const response = await adminFetch(
        `/api/admin/sync-usfs?dryRun=${dryRun}`,
        { method: 'POST' }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      const data: SyncResult = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  async function promotePOI(facilityId: string, facilityName: string) {
    // We need the POI id — but we only have the facility ID from sync results.
    // The promote endpoint needs a POI id, so first look it up via the POIs list.
    setPromoting(facilityId);
    try {
      // Fetch POIs to find the one with this RIDB facility ID
      const listResp = await adminFetch('/api/admin/pois');
      if (!listResp.ok) throw new Error('Failed to fetch POIs');
      const { pois } = await listResp.json();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const poi = pois.find((p: any) =>
        p.name === facilityName || p.slug === facilityName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      );

      if (!poi) {
        setPromoteResults((prev) => ({ ...prev, [facilityId]: 'POI not found — may not have been synced yet' }));
        return;
      }

      const resp = await adminFetch(`/api/admin/pois/${poi.id}/promote`, { method: 'POST' });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${resp.status}`);
      }

      const data = await resp.json();
      setPromoteResults((prev) => ({
        ...prev,
        [facilityId]: `Promoted to access point: ${data.accessPoint?.name || 'success'}`,
      }));
    } catch (err) {
      setPromoteResults((prev) => ({
        ...prev,
        [facilityId]: `Error: ${err instanceof Error ? err.message : String(err)}`,
      }));
    } finally {
      setPromoting(null);
    }
  }

  const campgrounds = result?.facilities.filter((f) => f.isCampground) ?? [];
  const otherFacilities = result?.facilities.filter((f) => !f.isCampground) ?? [];

  return (
    <AdminLayout
      title="Data Sync"
      description="Sync USFS campground data from Recreation.gov (RIDB)"
    >
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Action Buttons */}
        <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-2">USFS / RIDB Sync</h2>
          <p className="text-sm text-neutral-400 mb-2">
            Searches Recreation.gov for USFS-managed campgrounds near each river&apos;s gauge stations.
            Coordinates come from your database &mdash; no hardcoded locations.
          </p>
          <p className="text-sm text-neutral-400 mb-4">
            Campgrounds are added as <strong className="text-yellow-400">pending POIs</strong> (inactive until you review).
            You can then activate them as POIs or promote individual ones to access points.
          </p>

          <div className="flex gap-3">
            <button
              onClick={() => runSync(true)}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
            >
              <Eye className="w-4 h-4" />
              {loading ? 'Running...' : 'Preview (Dry Run)'}
            </button>

            <button
              onClick={() => runSync(false)}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
            >
              <Download className="w-4 h-4" />
              {loading ? 'Running...' : 'Sync as Pending POIs'}
            </button>
          </div>

          {loading && (
            <div className="mt-4 flex items-center gap-2 text-neutral-400">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Querying RIDB API for each gauge station... this may take 30-60 seconds.
            </div>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-red-300 font-medium">Sync failed</p>
              <p className="text-red-400 text-sm mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Results Summary */}
        {result && (
          <>
            <div className={`border rounded-xl p-4 ${result.dryRun ? 'bg-yellow-900/20 border-yellow-700' : 'bg-green-900/20 border-green-700'}`}>
              <div className="flex items-center gap-2 mb-3">
                {result.dryRun ? (
                  <AlertTriangle className="w-5 h-5 text-yellow-400" />
                ) : (
                  <CheckCircle className="w-5 h-5 text-green-400" />
                )}
                <span className={`font-semibold ${result.dryRun ? 'text-yellow-300' : 'text-green-300'}`}>
                  {result.message}
                </span>
                <span className="text-sm text-neutral-400 ml-auto">
                  {(result.durationMs / 1000).toFixed(1)}s
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="bg-neutral-800/50 rounded-lg p-3">
                  <div className="text-neutral-400">Fetched from RIDB</div>
                  <div className="text-xl font-bold text-white">{result.facilitiesFetched}</div>
                </div>
                <div className="bg-neutral-800/50 rounded-lg p-3">
                  <div className="text-neutral-400">USFS Facilities</div>
                  <div className="text-xl font-bold text-white">{result.facilitiesFiltered}</div>
                </div>
                <div className="bg-neutral-800/50 rounded-lg p-3">
                  <div className="text-neutral-400">Campgrounds</div>
                  <div className="text-xl font-bold text-white">{result.campgroundsSynced}</div>
                </div>
                <div className="bg-neutral-800/50 rounded-lg p-3">
                  <div className="text-neutral-400">
                    {result.dryRun ? 'Would Create' : 'POIs Created'}
                  </div>
                  <div className="text-xl font-bold text-green-400">{result.poisCreated}</div>
                </div>
              </div>

              {!result.dryRun && (result.campgroundsMatched > 0 || result.poisUpdated > 0) && (
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-neutral-800/50 rounded-lg p-3">
                    <div className="text-neutral-400">Matched Existing</div>
                    <div className="text-xl font-bold text-purple-400">{result.campgroundsMatched}</div>
                  </div>
                  <div className="bg-neutral-800/50 rounded-lg p-3">
                    <div className="text-neutral-400">POIs Updated</div>
                    <div className="text-xl font-bold text-blue-400">{result.poisUpdated}</div>
                  </div>
                </div>
              )}

              {result.errors > 0 && (
                <div className="mt-3 bg-red-900/30 rounded-lg p-3">
                  <div className="text-red-400 font-medium text-sm">{result.errors} error(s)</div>
                  {result.errorDetails.map((detail, i) => (
                    <div key={i} className="text-red-400/80 text-xs mt-1">{detail}</div>
                  ))}
                </div>
              )}
            </div>

            {/* Campgrounds Table */}
            {campgrounds.length > 0 && (
              <div className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-neutral-700">
                  <h3 className="text-white font-semibold">
                    Campgrounds ({campgrounds.length})
                  </h3>
                  <p className="text-xs text-neutral-400 mt-1">
                    {result.dryRun
                      ? 'These would be added as pending POIs'
                      : 'Added as pending POIs — activate or promote to access points below'}
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-neutral-700 text-neutral-400 text-left">
                        <th className="px-4 py-2">Name</th>
                        <th className="px-4 py-2">River</th>
                        <th className="px-4 py-2">Coordinates</th>
                        <th className="px-4 py-2">Reservable</th>
                        <th className="px-4 py-2">Activities</th>
                        <th className="px-4 py-2">Status</th>
                        <th className="px-4 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campgrounds.map((f) => (
                        <tr key={f.facilityId} className="border-b border-neutral-700/50 hover:bg-neutral-700/30">
                          <td className="px-4 py-3">
                            <div className="text-white font-medium">{f.name}</div>
                            {f.description && (
                              <div className="text-neutral-500 text-xs mt-0.5 max-w-xs truncate">
                                {f.description}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-neutral-300">{f.nearestRiver}</td>
                          <td className="px-4 py-3">
                            <a
                              href={`https://www.google.com/maps?q=${f.lat},${f.lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs"
                            >
                              <MapPin className="w-3 h-3" />
                              {f.lat.toFixed(4)}, {f.lng.toFixed(4)}
                            </a>
                          </td>
                          <td className="px-4 py-3">
                            {f.reservable ? (
                              <span className="text-green-400">Yes</span>
                            ) : (
                              <span className="text-neutral-500">No</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {f.activities.slice(0, 3).map((a) => (
                                <span key={a} className="px-1.5 py-0.5 text-xs bg-neutral-700 text-neutral-300 rounded">
                                  {a}
                                </span>
                              ))}
                              {f.activities.length > 3 && (
                                <span className="text-xs text-neutral-500">+{f.activities.length - 3}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <OutcomeBadge outcome={f.outcome} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                              {f.reservationUrl && (
                                <a
                                  href={f.reservationUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  Rec.gov
                                </a>
                              )}
                              {!result.dryRun && f.outcome === 'created' && !promoteResults[f.facilityId] && (
                                <button
                                  onClick={() => promotePOI(f.facilityId, f.name)}
                                  disabled={promoting === f.facilityId}
                                  className="flex items-center gap-1 text-orange-400 hover:text-orange-300 text-xs disabled:opacity-50"
                                >
                                  <ArrowUpRight className="w-3 h-3" />
                                  {promoting === f.facilityId ? 'Promoting...' : 'Promote to AP'}
                                </button>
                              )}
                              {promoteResults[f.facilityId] && (
                                <span className={`text-xs ${promoteResults[f.facilityId].startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                                  {promoteResults[f.facilityId]}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Other Facilities (non-campground, skipped) */}
            {otherFacilities.length > 0 && (
              <div className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-neutral-700">
                  <h3 className="text-white font-semibold">
                    Other USFS Facilities ({otherFacilities.length})
                    <span className="text-neutral-400 font-normal text-sm ml-2">skipped &mdash; not campgrounds</span>
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-neutral-700 text-neutral-400 text-left">
                        <th className="px-4 py-2">Name</th>
                        <th className="px-4 py-2">Type</th>
                        <th className="px-4 py-2">River</th>
                        <th className="px-4 py-2">Coordinates</th>
                      </tr>
                    </thead>
                    <tbody>
                      {otherFacilities.map((f) => (
                        <tr key={f.facilityId} className="border-b border-neutral-700/50 text-neutral-400">
                          <td className="px-4 py-2">{f.name}</td>
                          <td className="px-4 py-2">{f.type}</td>
                          <td className="px-4 py-2">{f.nearestRiver}</td>
                          <td className="px-4 py-2 text-xs">{f.lat.toFixed(4)}, {f.lng.toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
