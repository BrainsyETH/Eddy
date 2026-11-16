'use client';
import { useCallback, useEffect, useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { adminFetch } from '@/hooks/useAdminAuth';
interface Incident {
  id: string;
  job: string;
  summary: string;
  started_at: string;
  last_seen_at: string;
  recovered_at: string | null;
  occurrences: number;
}
interface Job {
  id: string;
  kind?: string;
  job?: string;
  state?: string;
  status?: string;
  created_at?: string;
  started_at?: string;
  updated_at?: string;
  error?: string;
  output?: { runUrl?: string; videoUrl?: string };
}
interface Operations {
  incidents: { state: string; rows: Incident[] | null };
  jobs: { state: string; rows: Job[] | null };
  runs: { state: string; rows: Job[] | null };
  deployment: {
    servingCommit: string | null;
    servingUrl: string | null;
    environment: string;
  };
  monitor: { configured: boolean };
}
const when = (value: string) => new Date(value).toLocaleString();
export default function OperationsPage() {
  const [data, setData] = useState<Operations | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch('/api/admin/operations');
      const result = await res.json();
      if (!res.ok) throw Error(result.error);
      setData(result);
      setError('');
    } catch {
      setError(
        'Operations did not load. Any displayed history may be out of date.',
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <AdminLayout
      title="Jobs & incidents"
      description="See failures, recovery, and the version serving this workspace."
    >
      <div className="admin-panel">
        <button className="admin-secondary" onClick={load} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
        {error && <p role="alert">{error}</p>}
      </div>
      {data && (
        <>
          <div className="admin-panel">
            <h2 className="font-bold text-lg">Current deployment</h2>
            <p className="my-2">
              Serving this session:{' '}
              <strong>
                {data.deployment.servingCommit?.slice(0, 12) ??
                  'Version unavailable'}
              </strong>{' '}
              · {data.deployment.environment}
            </p>
            {data.deployment.servingUrl && (
              <p className="text-sm break-all">{data.deployment.servingUrl}</p>
            )}
            <p className="mt-3 text-sm">
              Latest deployment attempt is separate from the serving version.{' '}
              <a
                href="https://vercel.com/dashboard"
                target="_blank"
                rel="noreferrer"
                className="admin-link"
              >
                View deployment history
              </a>
            </p>
          </div>
          <div className="admin-panel">
            <h2 className="font-bold text-lg">Incident history</h2>
            {data.incidents.state !== 'ok' ? (
              <p>History unavailable. This is not an all-clear.</p>
            ) : !data.incidents.rows?.length ? (
              <p className="my-3">
                No recorded incidents. Recording begins when this version is
                deployed.
              </p>
            ) : (
              <ul className="divide-y">
                {data.incidents.rows.map((i) => (
                  <li key={i.id} className="py-4">
                    <div className="flex flex-wrap gap-3 justify-between">
                      <strong>{i.job}</strong>
                      <span
                        className={
                          i.recovered_at ? 'text-green-700' : 'text-red-700'
                        }
                      >
                        {i.recovered_at ? 'Recovered' : 'Open'}
                      </span>
                    </div>
                    <p>{i.summary}</p>
                    <small>
                      First seen {when(i.started_at)} · {i.occurrences}{' '}
                      occurrences ·{' '}
                      {i.recovered_at
                        ? `Recovered ${when(i.recovered_at)}`
                        : `Last seen ${when(i.last_seen_at)}`}
                    </small>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {[
            { title: 'Requested jobs', source: data.jobs },
            { title: 'Recent automatic runs', source: data.runs },
          ].map(({ title, source }) => (
            <div className="admin-panel" key={title}>
              <h2 className="font-bold text-lg">{title}</h2>
              {source.state !== 'ok' ? (
                <p>History unavailable.</p>
              ) : !source.rows?.length ? (
                <p>No recorded runs yet.</p>
              ) : (
                <ul className="divide-y">
                  {source.rows.map((j) => (
                    <li className="py-3" key={j.id}>
                      <div className="flex flex-wrap gap-3 justify-between">
                        <strong>{j.kind ?? j.job}</strong>
                        <span>{j.state ?? j.status}</span>
                      </div>
                      <small>{when(j.created_at ?? j.started_at!)}</small>
                      {j.error && <p>{j.error}</p>}
                      {j.output?.videoUrl && (
                        <a
                          className="admin-link mr-4"
                          href={j.output.videoUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open output
                        </a>
                      )}
                      {j.output?.runUrl && (
                        <a
                          className="admin-link"
                          href={j.output.runUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Workflow logs
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          <div className="admin-panel">
            <h2 className="font-bold text-lg">External monitoring</h2>
            <p className="my-2">
              {data.monitor.configured
                ? 'Readiness endpoint configured. External monitor activity is not verified here.'
                : 'External readiness monitoring is not configured.'}
            </p>
            <p className="text-sm">
              The repository includes a backstop check that runs outside Eddy
              a few times a day, on GitHub&apos;s schedule. It is too
              infrequent to detect an outage promptly; that needs an external
              uptime service. It needs the dedicated read-only monitoring
              credential in both deployment and workflow settings. A successful
              page load alone does not prove data is fresh.
            </p>
            <a
              className="admin-link"
              href="https://github.com/BrainsyETH/Eddy/actions/workflows/admin-uptime.yml"
              target="_blank"
              rel="noreferrer"
            >
              View backstop checks
            </a>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
