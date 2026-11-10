'use client';

// /admin/lakes — review lake launches: the places the Phase 0 queue staged,
// approved one at a time with a method, amenities, and the access point a
// place already is. Nothing here moves a pin; a wrong location is a note for
// the data, not an edit in a form.

import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { adminFetch } from '@/hooks/useAdminAuth';

interface LaunchRow {
  id: string;
  lake_slug: string;
  slug: string;
  name: string;
  longitude: number;
  latitude: number;
  launch_methods: string[];
  amenities: string[];
  managing_agency: string | null;
  fee_required: boolean | null;
  ramp_bottom_elev_ft: number | null;
  ramp_closure_elev_ft: number | null;
  elev_datum: string | null;
  access_point_id: string | null;
  sources: Array<{ provider: string; source_id: string; type?: string | null; waterbody?: string | null; agency?: string | null }>;
  review_note: string | null;
  approved: boolean;
  approved_at: string | null;
}

interface Draft {
  trailer: boolean;
  hand: boolean;
  amenities: string;
  managing_agency: string;
  fee_required: '' | 'true' | 'false';
  access_point_id: string;
  review_note: string;
}

const AMENITY_HINT = 'courtesy_dock, parking, restroom, picnic';

function draftFor(row: LaunchRow): Draft {
  return {
    trailer: row.launch_methods.includes('trailer'),
    hand: row.launch_methods.includes('hand'),
    amenities: row.amenities.join(', '),
    managing_agency: row.managing_agency ?? '',
    fee_required: row.fee_required === null ? '' : row.fee_required ? 'true' : 'false',
    access_point_id: row.access_point_id ?? '',
    review_note: row.review_note ?? '',
  };
}

function LaunchEditor({ row, onSaved }: { row: LaunchRow; onSaved: (row: LaunchRow) => void }) {
  const [draft, setDraft] = useState<Draft>(() => draftFor(row));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const save = useCallback(async (approved?: boolean) => {
    setBusy(true);
    setMessage(null);
    const methods = [draft.trailer ? 'trailer' : null, draft.hand ? 'hand' : null].filter(Boolean);
    const body: Record<string, unknown> = {
      launch_methods: methods,
      amenities: draft.amenities.split(',').map((s) => s.trim()).filter(Boolean),
      managing_agency: draft.managing_agency.trim() || null,
      fee_required: draft.fee_required === '' ? null : draft.fee_required === 'true',
      access_point_id: draft.access_point_id.trim() || null,
      review_note: draft.review_note.trim() || null,
    };
    if (approved !== undefined) body.approved = approved;
    try {
      const response = await adminFetch(`/api/admin/lake-launches/${row.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = (await response.json().catch(() => ({}))) as { launch?: LaunchRow; error?: string };
      if (!response.ok || !json.launch) {
        setMessage(json.error ?? `Save failed (${response.status})`);
        return;
      }
      onSaved(json.launch);
      setDraft(draftFor(json.launch));
      setMessage(approved === true ? 'Approved and published.' : approved === false ? 'Unpublished.' : 'Saved.');
    } finally {
      setBusy(false);
    }
  }, [draft, row.id, onSaved]);

  const mapHref = `https://www.google.com/maps/@?api=1&map_action=map&center=${row.latitude},${row.longitude}&zoom=17&basemap=satellite`;

  return (
    <li className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="font-medium text-neutral-900">{row.name}</span>
          <span className="ml-2 text-xs text-neutral-500">{row.slug}</span>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs ${row.approved ? 'bg-primary-100 text-primary-800' : 'bg-neutral-100 text-neutral-600'}`}>
          {row.approved ? `Published ${row.approved_at?.slice(0, 10) ?? ''}` : 'Not published'}
        </span>
      </div>
      <p className="mt-1 text-xs text-neutral-600">
        {row.latitude.toFixed(5)}, {row.longitude.toFixed(5)} · <a className="text-primary-700 underline" href={mapHref} target="_blank" rel="noopener noreferrer">Check location on imagery</a>
        {row.ramp_bottom_elev_ft !== null || row.ramp_closure_elev_ft !== null ? ` · thresholds ${row.ramp_bottom_elev_ft ?? '—'} / ${row.ramp_closure_elev_ft ?? '—'} ft ${row.elev_datum ?? ''}` : ' · no elevation thresholds published'}
      </p>
      <p className="mt-1 text-xs text-neutral-600">
        Sources: {row.sources.map((s) => `${s.provider}${s.type ? ` (${s.type})` : ''}${s.waterbody ? ` · ${s.waterbody}` : ''}`).join('; ') || 'none'}
      </p>
      {row.review_note && <p className="mt-1 whitespace-pre-wrap text-xs text-neutral-700">{row.review_note}</p>}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <fieldset className="text-sm">
          <legend className="text-xs font-medium text-neutral-500">Launch method (required to publish)</legend>
          <label className="mr-4 inline-flex items-center gap-1.5"><input type="checkbox" checked={draft.trailer} onChange={(e) => setDraft({ ...draft, trailer: e.target.checked })} /> Trailer ramp</label>
          <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={draft.hand} onChange={(e) => setDraft({ ...draft, hand: e.target.checked })} /> Hand launch</label>
        </fieldset>
        <label className="text-sm">
          <span className="block text-xs font-medium text-neutral-500">Amenities (comma separated, e.g. {AMENITY_HINT})</span>
          <input className="mt-1 w-full rounded border border-neutral-300 px-2 py-1" value={draft.amenities} onChange={(e) => setDraft({ ...draft, amenities: e.target.value })} />
        </label>
        <label className="text-sm">
          <span className="block text-xs font-medium text-neutral-500">Managing agency</span>
          <input className="mt-1 w-full rounded border border-neutral-300 px-2 py-1" value={draft.managing_agency} onChange={(e) => setDraft({ ...draft, managing_agency: e.target.value })} />
        </label>
        <label className="text-sm">
          <span className="block text-xs font-medium text-neutral-500">Fee</span>
          <select className="mt-1 w-full rounded border border-neutral-300 px-2 py-1" value={draft.fee_required} onChange={(e) => setDraft({ ...draft, fee_required: e.target.value as Draft['fee_required'] })}>
            <option value="">Unknown</option>
            <option value="false">No fee</option>
            <option value="true">Fee</option>
          </select>
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="block text-xs font-medium text-neutral-500">Existing access point id (when this place is already one; keeps one identity)</span>
          <input className="mt-1 w-full rounded border border-neutral-300 px-2 py-1 font-mono text-xs" value={draft.access_point_id} onChange={(e) => setDraft({ ...draft, access_point_id: e.target.value })} placeholder="uuid or blank" />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="block text-xs font-medium text-neutral-500">Review note</span>
          <textarea className="mt-1 w-full rounded border border-neutral-300 px-2 py-1" rows={2} value={draft.review_note} onChange={(e) => setDraft({ ...draft, review_note: e.target.value })} />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy} onClick={() => save()} className="rounded border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50 disabled:opacity-50">Save</button>
        {row.approved ? (
          <button type="button" disabled={busy} onClick={() => save(false)} className="rounded border border-accent-300 px-3 py-1 text-sm text-accent-900 hover:bg-accent-50 disabled:opacity-50">Unpublish</button>
        ) : (
          <button type="button" disabled={busy || (!draft.trailer && !draft.hand)} onClick={() => save(true)} className="rounded bg-primary-700 px-3 py-1 text-sm text-white hover:bg-primary-800 disabled:opacity-50">Save and publish</button>
        )}
        {message && <span className="text-xs text-neutral-600" role="status">{message}</span>}
      </div>
    </li>
  );
}

export default function AdminLakesPage() {
  const [lakes, setLakes] = useState<Array<{ slug: string; name: string }>>([]);
  const [lake, setLake] = useState<string>('');
  const [rows, setRows] = useState<LaunchRow[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (slug: string) => {
    setStatus('loading');
    setError(null);
    const response = await adminFetch(`/api/admin/lake-launches${slug ? `?lake=${encodeURIComponent(slug)}` : ''}`);
    const json = (await response.json().catch(() => ({}))) as { lakes?: Array<{ slug: string; name: string }>; launches?: LaunchRow[]; error?: string };
    if (!response.ok) {
      setError(json.error ?? `Request failed (${response.status})`);
      setStatus('error');
      return;
    }
    setLakes(json.lakes ?? []);
    setRows(json.launches ?? []);
    setStatus('ready');
  }, []);

  useEffect(() => { void load(lake); }, [lake, load]);

  const onSaved = useCallback((saved: LaunchRow) => setRows((prev) => prev.map((r) => (r.id === saved.id ? saved : r))), []);
  const counts = useMemo(() => ({ published: rows.filter((r) => r.approved).length, pending: rows.filter((r) => !r.approved).length }), [rows]);

  return (
    <AdminLayout title="Lake launches" description="Review the places staged from the launch queues. A launch publishes only with a method and a source, and links to an existing access point when it already is one.">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm">
          <span className="mr-2 text-xs font-medium text-neutral-500">Lake</span>
          <select className="rounded border border-neutral-300 px-2 py-1" value={lake} onChange={(e) => setLake(e.target.value)}>
            <option value="">All lakes</option>
            {lakes.map((l) => <option key={l.slug} value={l.slug}>{l.name}</option>)}
          </select>
        </label>
        <span className="text-xs text-neutral-600">{counts.published} published · {counts.pending} pending review</span>
      </div>
      {status === 'loading' && <p className="mt-4 text-sm text-neutral-600">Loading…</p>}
      {status === 'error' && <p className="mt-4 text-sm text-accent-900" role="alert">{error}</p>}
      {status === 'ready' && rows.length === 0 && <p className="mt-4 text-sm text-neutral-600">No launch rows. Stage the queue first (scripts/ingestion/lakes/2026-11-09/stage-launch-candidates.sql).</p>}
      {status === 'ready' && rows.length > 0 && (
        <ul className="mt-4 space-y-3">
          {rows.map((row) => <LaunchEditor key={row.id} row={row} onSaved={onSaved} />)}
        </ul>
      )}
    </AdminLayout>
  );
}
