'use client';
import { useCallback, useEffect, useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { adminFetch } from '@/hooks/useAdminAuth';
import type { CompletedFloat } from '@shared/float-archive';

export default function ContributionsPage() {
  return (
    <AdminLayout
      title="Float contributions"
      description="Private measurement review. These trips do not change public estimates."
    >
      <Review />
    </AdminLayout>
  );
}
function Review() {
  const [page, setPage] = useState(0);
  const [trips, setTrips] = useState<{ payload: CompletedFloat; updated_at: string }[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminFetch(`/api/admin/float-contributions?page=${page}`);
      if (!response.ok) throw new Error('Could not load contributions.');
      const data = await response.json();
      setTrips(data.trips);
      setCount(data.count);
    } catch {
      setError('Could not load contributions.');
    } finally {
      setLoading(false);
    }
  }, [page]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <div className="space-y-4">
      <p>
        Only explicitly contributed, undeleted trips are shown. Turning sharing off excludes the account’s trips.
        Summaries are account linked; raw GPS traces are never uploaded.
      </p>
      <p>
        {count} contributed floats. Trips from people floating together are not independent evidence. Review coverage
        and measurement quality before considering calibration.
      </p>
      <button className="rounded border px-4 py-2" onClick={() => void load()} disabled={loading}>
        Refresh
      </button>
      {error ? <p role="alert">{error}</p> : null}
      {loading ? (
        <p>Loading…</p>
      ) : trips.length === 0 ? (
        <p>No contributed floats yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {[
                  'Route / date',
                  'Boat',
                  'Tracked distance',
                  'Minutes: moving / stopped / unknown',
                  'Moving pace',
                  'Water near start',
                  'Review notes',
                ].map((label) => (
                  <th className="p-3" key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trips.map(({ payload: t }) => (
                <tr key={t.id} className="border-t">
                  <td className="p-3">
                    {t.riverName}
                    <br />
                    {t.putInName ?? 'On-river start'} → {t.takeOutName}
                    <br />
                    {new Date(t.startedAt).toLocaleString()}
                  </td>
                  <td className="p-3">{t.boatType ?? 'Unknown'}</td>
                  <td className="p-3">{t.distanceMiles.toFixed(1)} mi</td>
                  <td className="p-3">
                    {[t.movingMs, t.stoppedMs, t.unknownMs].map((ms) => Math.round(ms / 60000)).join(' / ')}
                  </td>
                  <td className="p-3">{t.movingMph == null ? 'Unknown' : `${t.movingMph.toFixed(1)} mph`}</td>
                  <td className="p-3">
                    {t.water
                      ? `${t.water.gaugeName}: ${t.water.heightFt ?? '—'} ft / ${t.water.dischargeCfs ?? '—'} cfs (${t.water.observedAt})`
                      : 'Unavailable'}
                  </td>
                  <td className="p-3">
                    {[
                      !t.reachedTakeOut && 'Arrival unconfirmed',
                      !t.boatType && 'Boat missing',
                      !t.water && 'Water missing',
                      t.unknownMs > t.elapsedMs * 0.2 && 'Over 20% unobserved',
                      t.movingMs < 15 * 60000 && 'Under 15 minutes observed movement',
                    ]
                      .filter(Boolean)
                      .join('; ') || 'Review before use'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex gap-4">
        <button disabled={page === 0 || loading} onClick={() => setPage((p) => p - 1)}>
          Previous
        </button>
        <span>Page {page + 1}</span>
        <button disabled={(page + 1) * 50 >= count || loading} onClick={() => setPage((p) => p + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}
