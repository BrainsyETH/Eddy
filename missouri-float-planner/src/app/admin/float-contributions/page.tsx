'use client';
// src/app/admin/float-contributions/page.tsx
// Private review of floats people chose to contribute: how measured moving pace
// compares with Eddy's estimate per route, and per-trip quality checks with a
// use/exclude decision. Nothing here changes public estimates.
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import AdminLayout from '@/components/admin/AdminLayout';
import { adminFetch } from '@/hooks/useAdminAuth';
import {
  contributionFlags,
  paceDifference,
  routeLabel,
  type ContributionTrip,
  type ReviewDecision,
  type RouteSummary,
} from '@/lib/admin/float-contributions';

interface Payload {
  summary: RouteSummary[];
  rivers: { slug: string; name: string; trips: number }[];
  trips: ContributionTrip[];
  count: number;
  accounts: number;
  page: number;
  pageSize: number;
  capped: boolean;
  reviewsAvailable: boolean;
}

const mph = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(1)} mph`);

function duration(ms: number) {
  const minutes = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(minutes / 60);
  if (!h) return `${minutes} m`;
  return minutes % 60 ? `${h} h ${minutes % 60} m` : `${h} h`;
}

function when(value: number | string) {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** "12% faster" / "8% slower" against Eddy's estimate. */
function DifferenceText({ value }: { value: number | null }) {
  if (value == null) return <span className="text-neutral-500">—</span>;
  const pct = Math.round(Math.abs(value) * 100);
  if (pct === 0) return <span>Matches</span>;
  return (
    <span className={value > 0 ? 'text-blue-400' : 'text-yellow-400'}>
      {pct}% {value > 0 ? 'faster' : 'slower'}
    </span>
  );
}

function flowRange(r: RouteSummary) {
  if (r.minCfs == null || r.maxCfs == null) return '—';
  const f = (n: number) => Math.round(n).toLocaleString('en-US');
  return r.minCfs === r.maxCfs ? `${f(r.minCfs)} cfs` : `${f(r.minCfs)}–${f(r.maxCfs)} cfs`;
}

export default function ContributionsPage() {
  return (
    <AdminLayout
      title="Float contributions"
      description="Trips people chose to share. Review only: these never change public estimates."
    >
      <Review />
    </AdminLayout>
  );
}

function Review() {
  const [river, setRiver] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (river) params.set('river', river);
      const response = await adminFetch(`/api/admin/float-contributions?${params}`);
      if (!response.ok) throw new Error();
      setData(await response.json());
    } catch {
      setError('Could not load contributions.');
    } finally {
      setLoading(false);
    }
  }, [page, river]);

  useEffect(() => {
    void load();
  }, [load]);

  const review = async (trip: ContributionTrip, decision: ReviewDecision) => {
    const key = `${trip.userId}/${trip.floatId}`;
    // Pressing the active decision again clears it.
    const next = trip.review?.decision === decision ? null : decision;
    setSaving(key);
    setSaveError(null);
    try {
      const response = await adminFetch('/api/admin/float-contributions/review', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: trip.userId, floatId: trip.floatId, decision: next }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not save the review.');
      // The route summary depends on exclusions, so reload it with the trip.
      await load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save the review.');
    } finally {
      setSaving(null);
    }
  };

  const pages = data ? Math.max(1, Math.ceil(data.count / data.pageSize)) : 1;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="river-filter" className="text-sm text-neutral-400">
            River:
          </label>
          <select
            id="river-filter"
            value={river}
            onChange={(e) => {
              setRiver(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">All rivers</option>
            {data?.rivers.map((r) => (
              <option key={r.slug} value={r.slug}>
                {r.name} ({r.trips})
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50 admin-secondary"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <p role="alert" className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg">
          {error}
        </p>
      )}
      {data?.capped && (
        <p className="text-sm text-yellow-400">
          Showing the newest 2,000 contributed trips; older trips are not included in these numbers.
        </p>
      )}
      {data && !data.reviewsAvailable && (
        <p className="text-sm text-yellow-400">
          Review decisions are unavailable until the review migration is applied. Trips are read-only.
        </p>
      )}

      {loading && !data ? (
        <p className="text-neutral-400">Loading…</p>
      ) : data && data.count === 0 ? (
        <p className="text-neutral-400 py-8 text-center">No contributed floats yet.</p>
      ) : data ? (
        <>
          <section aria-labelledby="by-route" className="space-y-2">
            <h2 id="by-route" className="text-base font-semibold text-white">
              By route
            </h2>
            <p className="text-xs text-neutral-400">
              Medians of measured moving pace against Eddy&rsquo;s estimate for the same trips. Excluded trips are
              left out. Several trips from one account are not independent.
            </p>
            <div className="overflow-x-auto rounded-xl border border-neutral-700 bg-neutral-800">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="text-xs text-neutral-400">
                  <tr>
                    <th className="p-3 font-medium">Route</th>
                    <th className="p-3 font-medium">Trips</th>
                    <th className="p-3 font-medium">Moving pace</th>
                    <th className="p-3 font-medium">Eddy estimate</th>
                    <th className="p-3 font-medium">Difference</th>
                    <th className="p-3 font-medium">Flow seen</th>
                  </tr>
                </thead>
                <tbody>
                  {data.summary.map((r) => (
                    <tr key={r.key} className="border-t border-neutral-700 align-top">
                      <td className="p-3">
                        <div className="text-white">{r.routeLabel}</div>
                        <div className="text-xs text-neutral-400">{r.riverName}</div>
                      </td>
                      <td className="p-3 text-neutral-200">
                        {r.trips}
                        <div className="text-xs text-neutral-400">
                          {r.accounts} {r.accounts === 1 ? 'account' : 'accounts'}
                          {r.excluded > 0 && ` · ${r.excluded} excluded`}
                        </div>
                      </td>
                      <td className="p-3 text-neutral-200">{mph(r.medianMovingMph)}</td>
                      <td className="p-3 text-neutral-200">{mph(r.medianPlannerMph)}</td>
                      <td className="p-3">
                        <DifferenceText value={r.medianDifference} />
                        <div className="text-xs text-neutral-400">
                          {r.paired} of {r.trips} comparable
                        </div>
                      </td>
                      <td className="p-3 text-neutral-200">{flowRange(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="trips" className="space-y-2">
            <h2 id="trips" className="text-base font-semibold text-white">
              Trips · {data.count}
              <span className="ml-2 text-xs font-normal text-neutral-400">
                from {data.accounts} {data.accounts === 1 ? 'account' : 'accounts'}
              </span>
            </h2>
            {saveError && (
              <p role="alert" className="text-sm text-red-400">
                {saveError}
              </p>
            )}
            <div className="overflow-x-auto rounded-xl border border-neutral-700 bg-neutral-800">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead className="text-xs text-neutral-400">
                  <tr>
                    <th className="p-3 font-medium">Trip</th>
                    <th className="p-3 font-medium">Boat · distance</th>
                    <th className="p-3 font-medium">Time</th>
                    <th className="p-3 font-medium">Pace vs estimate</th>
                    <th className="p-3 font-medium">Water near start</th>
                    <th className="p-3 font-medium">Checks</th>
                    <th className="p-3 font-medium">Review</th>
                  </tr>
                </thead>
                <tbody>
                  {data.trips.map((trip) => {
                    const t = trip.float;
                    const key = `${trip.userId}/${trip.floatId}`;
                    const flags = contributionFlags(t);
                    const excluded = trip.review?.decision === 'exclude';
                    return (
                      <tr
                        key={key}
                        className={`border-t border-neutral-700 align-top ${excluded ? 'opacity-60' : ''}`}
                      >
                        <td className="p-3">
                          <div className="text-white">{routeLabel(t)}</div>
                          <div className="text-xs text-neutral-400">
                            {t.riverName} · {when(t.startedAt)}
                          </div>
                        </td>
                        <td className="p-3 text-neutral-200">
                          {t.boatType ?? 'Unknown boat'}
                          <div className="text-xs text-neutral-400">{t.distanceMiles.toFixed(1)} mi tracked</div>
                        </td>
                        <td className="p-3 text-neutral-200">
                          {duration(t.movingMs)} moving
                          <div className="text-xs text-neutral-400">
                            {duration(t.stoppedMs)} stopped · {duration(t.unknownMs)} unobserved
                          </div>
                        </td>
                        <td className="p-3 text-neutral-200">
                          {mph(t.movingMph)}
                          <div className="text-xs text-neutral-400">
                            Estimate {mph(t.plannerMph)} · <DifferenceText value={paceDifference(t)} />
                          </div>
                        </td>
                        <td className="p-3 text-neutral-200">
                          {t.water ? (
                            <>
                              {[
                                t.water.heightFt != null && `${t.water.heightFt} ft`,
                                t.water.dischargeCfs != null &&
                                  `${Math.round(t.water.dischargeCfs).toLocaleString('en-US')} cfs`,
                              ]
                                .filter(Boolean)
                                .join(' · ') || 'No reading'}
                              <div className="text-xs text-neutral-400">
                                {t.water.gaugeName} · {when(t.water.observedAt)}
                              </div>
                            </>
                          ) : (
                            <span className="text-neutral-500">Unavailable</span>
                          )}
                        </td>
                        <td className="p-3">
                          {flags.length ? (
                            <ul className="flex flex-wrap gap-1">
                              {flags.map((f) => (
                                <li
                                  key={f}
                                  className="px-2 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                                >
                                  {f}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-xs text-green-400">No issues found</span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex gap-1" role="group" aria-label={`Review ${routeLabel(t)}`}>
                            {(['use', 'exclude'] as const).map((d) => {
                              const active = trip.review?.decision === d;
                              return (
                                <button
                                  key={d}
                                  onClick={() => void review(trip, d)}
                                  disabled={!data.reviewsAvailable || saving === key}
                                  aria-pressed={active}
                                  className={`px-2.5 py-1 rounded text-xs font-medium disabled:opacity-50 ${
                                    active
                                      ? d === 'use'
                                        ? 'bg-green-600 text-white'
                                        : 'bg-red-600 text-white'
                                      : 'admin-secondary'
                                  }`}
                                >
                                  {d === 'use' ? 'Use' : 'Exclude'}
                                </button>
                              );
                            })}
                          </div>
                          {trip.review && (
                            <div className="mt-1 text-xs text-neutral-400">
                              {trip.review.reviewedBy}, {when(trip.review.reviewedAt)}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <nav aria-label="Pages" className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                  className="px-3 py-1.5 text-sm rounded-lg disabled:opacity-40 admin-secondary"
                >
                  Previous
                </button>
                <span className="text-sm text-neutral-500">
                  Page {page} of {pages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                  disabled={page >= pages || loading}
                  className="px-3 py-1.5 text-sm rounded-lg disabled:opacity-40 admin-secondary"
                >
                  Next
                </button>
              </nav>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
