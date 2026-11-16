'use client';
// src/app/admin/hazards/page.tsx
// Admin page for managing river hazards (dams, portages, strainers, rapids…):
// add, edit, confirm they are still there, retire, and delete.

import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/hooks/useAdminAuth';
import AdminLayout from '@/components/admin/AdminLayout';
import ListPager from '@/components/admin/ListPager';
import { useAdminInteractions } from '@/components/admin/AdminInteractionProvider';
import HazardForm, {
  EMPTY_HAZARD,
  HAZARD_SEVERITY_OPTIONS,
  HAZARD_TYPE_OPTIONS,
  hazardDraftBody,
  type HazardDraft,
} from '@/components/admin/HazardForm';
import { ageLabel, daysSince, HAZARD_STALE_DAYS } from '@/lib/admin/hazards';
import {
  AlertTriangle,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  X,
  ShieldAlert,
  Pencil,
  Archive,
  RotateCcw,
} from 'lucide-react';

interface Hazard {
  id: string;
  riverId: string | null;
  riverName: string | null;
  name: string;
  type: string;
  description: string | null;
  severity: string | null;
  portageRequired: boolean;
  portageSide: string | null;
  active: boolean;
  seasonalNotes: string | null;
  minSafeLevel: number | null;
  maxSafeLevel: number | null;
  latitude: number | null;
  longitude: number | null;
  riverMileDownstream: number | null;
  createdAt: string;
  updatedAt: string;
}

const PAGE_SIZE = 50;

const SEVERITY_CLASSES: Record<string, string> = {
  info: 'bg-blue-500/20 text-blue-400',
  caution: 'bg-yellow-500/20 text-yellow-400',
  warning: 'bg-orange-500/20 text-orange-400',
  danger: 'bg-red-500/20 text-red-400',
};

const optionLabel = (options: { value: string; label: string }[], value: string | null) =>
  options.find((o) => o.value === value)?.label ?? value ?? 'Not set';

function toDraft(h: Hazard): HazardDraft {
  return {
    name: h.name,
    type: h.type,
    severity: h.severity ?? 'caution',
    riverId: h.riverId ?? '',
    latitude: h.latitude === null ? '' : String(h.latitude),
    longitude: h.longitude === null ? '' : String(h.longitude),
    riverMile: h.riverMileDownstream === null ? '' : String(h.riverMileDownstream),
    description: h.description ?? '',
    seasonalNotes: h.seasonalNotes ?? '',
    portageRequired: h.portageRequired,
    portageSide: h.portageSide ?? '',
  };
}

const select =
  'px-3 py-1.5 bg-neutral-800 border border-neutral-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500';

export default function AdminHazardsPage() {
  const { confirm } = useAdminInteractions();
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [rivers, setRivers] = useState<{ id: string; name: string }[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [riverFilter, setRiverFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const fetchHazards = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch(
        `/api/admin/hazards?${new URLSearchParams({
          page: String(page),
          limit: String(PAGE_SIZE),
          type: typeFilter,
          severity: severityFilter,
          river: riverFilter,
          status: statusFilter,
          q: search,
        })}`,
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to fetch hazards');
      setHazards(data.hazards);
      setTotal(data.total ?? 0);
      setRivers(data.rivers ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch hazards');
    } finally {
      setLoading(false);
    }
  }, [page, typeFilter, severityFilter, riverFilter, statusFilter, search]);

  useEffect(() => {
    void fetchHazards();
  }, [fetchHazards]);

  // Search as you type, without a request per keystroke.
  useEffect(() => {
    const next = searchInput.trim();
    if (next === search) return;
    const timer = setTimeout(() => {
      setSearch(next);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, search]);

  const flash = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const filter = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    set(e.target.value);
    setPage(1);
  };

  const createHazard = async (draft: HazardDraft) => {
    const res = await adminFetch('/api/admin/hazards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(hazardDraftBody(draft)),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to create hazard');
    setShowCreate(false);
    flash('Hazard created');
    await fetchHazards();
  };

  /** PUT one hazard and put the saved row back in the list. */
  const put = async (hazard: Hazard, body: Record<string, unknown>) => {
    const res = await adminFetch(`/api/admin/hazards/${hazard.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, expectedUpdatedAt: hazard.updatedAt }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 409 && data.hazard) {
      // Someone saved first. Take their version as the new baseline (an open
      // form keeps what was typed), so saving again is a deliberate overwrite.
      setHazards((prev) => prev.map((h) => (h.id === hazard.id ? (data.hazard as Hazard) : h)));
      throw new Error('This hazard was changed by someone else. Check the current details, then try again.');
    }
    if (!res.ok) throw new Error(data.error || 'Failed to update hazard');
    setHazards((prev) => prev.map((h) => (h.id === hazard.id ? (data.hazard as Hazard) : h)));
  };

  const saveEdit = async (hazard: Hazard, draft: HazardDraft) => {
    const body: Record<string, unknown> = hazardDraftBody(draft);
    // A hazard with no location can be edited without adding one.
    if (draft.latitude === '' && draft.longitude === '') {
      delete body.latitude;
      delete body.longitude;
    }
    await put(hazard, body);
    setEditing(null);
    flash(`Saved ${draft.name.trim()}`);
  };

  const quick = async (hazard: Hazard, body: Record<string, unknown>, done: string) => {
    setBusy(hazard.id);
    try {
      await put(hazard, body);
      flash(done);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update hazard');
    } finally {
      setBusy(null);
    }
  };

  const deleteHazard = async (hazard: Hazard) => {
    if (
      !(await confirm(
        `Delete "${hazard.name}"? This cannot be undone. To stop warning paddlers but keep the record, retire it instead.`,
        { confirmLabel: 'Delete hazard', danger: true },
      ))
    )
      return;
    setBusy(hazard.id);
    try {
      const res = await adminFetch(`/api/admin/hazards/${hazard.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete');
      }
      flash(`Deleted ${hazard.name}`);
      await fetchHazards();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminLayout
      title="River Hazards"
      description="Dams, portages, strainers, rapids and other hazards paddlers are warned about"
    >
      <div className="p-6 space-y-4 max-w-6xl">
        {error && (
          <div role="alert" className="p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-200 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            {error}
            <button onClick={() => setError(null)} aria-label="Dismiss error" className="ml-auto">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {successMessage && (
          <div role="status" className="p-4 bg-green-500/20 border border-green-500/50 rounded-lg text-green-200 flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            {successMessage}
          </div>
        )}

        {/* Filters & Create */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <label htmlFor="hazard-search" className="sr-only">
              Search hazards
            </label>
            <input
              id="hazard-search"
              type="search"
              placeholder="Search name or description"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className={`${select} w-full sm:w-60 placeholder-neutral-500`}
            />
            <select aria-label="River" value={riverFilter} onChange={filter(setRiverFilter)} className={select}>
              <option value="all">All rivers</option>
              {rivers.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <select aria-label="Status" value={statusFilter} onChange={filter(setStatusFilter)} className={select}>
              <option value="all">Active and retired</option>
              <option value="active">Active</option>
              <option value="stale">Not checked in {HAZARD_STALE_DAYS} days</option>
              <option value="inactive">Retired</option>
            </select>
            <select aria-label="Type" value={typeFilter} onChange={filter(setTypeFilter)} className={select}>
              <option value="all">All types</option>
              {HAZARD_TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <select aria-label="Severity" value={severityFilter} onChange={filter(setSeverityFilter)} className={select}>
              <option value="all">All severities</option>
              {HAZARD_SEVERITY_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm rounded-lg shrink-0"
          >
            <Plus className="w-4 h-4" />
            New hazard
          </button>
        </div>

        {showCreate && (
          <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">New hazard</h3>
            <HazardForm
              formId="new-hazard"
              initial={EMPTY_HAZARD}
              rivers={rivers}
              submitLabel="Create hazard"
              onSubmit={createHazard}
              onCancel={() => setShowCreate(false)}
            />
          </div>
        )}

        {loading && hazards.length === 0 ? (
          <div className="text-center py-12 text-neutral-400">Loading hazards…</div>
        ) : hazards.length === 0 ? (
          <div className="text-center py-12 text-neutral-400">No hazards match these filters.</div>
        ) : (
          <div className="space-y-2">
            {hazards.map((hazard) => {
              const open = expanded === hazard.id;
              const days = daysSince(hazard.updatedAt);
              const stale = hazard.active && days !== null && days >= HAZARD_STALE_DAYS;
              return (
                <div key={hazard.id} className="bg-neutral-800 rounded-lg border border-neutral-700 overflow-hidden">
                  <button
                    type="button"
                    aria-expanded={open}
                    className="w-full p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 text-left hover:bg-neutral-750"
                    onClick={() => {
                      setExpanded(open ? null : hazard.id);
                      setEditing(null);
                    }}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      {open ? (
                        <ChevronDown className="w-4 h-4 text-neutral-400 shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-neutral-400 shrink-0" />
                      )}
                      <ShieldAlert className="w-4 h-4 text-primary-400 shrink-0" />
                      <span className="min-w-0">
                        <span className="block font-medium text-white truncate">{hazard.name}</span>
                        <span className="block text-xs text-neutral-400">
                          {[
                            optionLabel(HAZARD_TYPE_OPTIONS, hazard.type),
                            hazard.riverName ?? 'No river',
                            hazard.riverMileDownstream === null ? 'No river mile' : `Mile ${hazard.riverMileDownstream.toFixed(1)}`,
                          ].join(' • ')}
                        </span>
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-2 pl-11 sm:pl-0 sm:justify-end sm:shrink-0">
                      {hazard.active && (
                        <span className={`px-2 py-0.5 text-xs rounded-full ${stale ? 'bg-yellow-500/20 text-yellow-400' : 'text-neutral-400'}`}>
                          {ageLabel(days)}
                        </span>
                      )}
                      <span className={`px-2 py-0.5 text-xs rounded-full ${SEVERITY_CLASSES[hazard.severity ?? ''] ?? 'bg-neutral-700 text-neutral-300'}`}>
                        {optionLabel(HAZARD_SEVERITY_OPTIONS, hazard.severity)}
                      </span>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${hazard.active ? 'bg-green-500/20 text-green-400' : 'bg-neutral-700 text-neutral-300'}`}>
                        {hazard.active ? 'Active' : 'Retired'}
                      </span>
                    </span>
                  </button>

                  {open && editing === hazard.id && (
                    <div className="border-t border-neutral-700 p-4">
                      <HazardForm
                        formId={`edit-${hazard.id}`}
                        initial={toDraft(hazard)}
                        rivers={rivers}
                        submitLabel="Save changes"
                        locationOptional={hazard.latitude === null}
                        onSubmit={(draft) => saveEdit(hazard, draft)}
                        onCancel={() => setEditing(null)}
                      />
                    </div>
                  )}

                  {open && editing !== hazard.id && (
                    <div className="border-t border-neutral-700 p-4 space-y-3">
                      {hazard.riverMileDownstream === null && hazard.active && (
                        <p className="text-sm text-yellow-400">
                          No river mile, so trip plans can’t warn about this hazard. Edit it to add one.
                        </p>
                      )}
                      <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <dt className="text-neutral-400 text-xs">Location</dt>
                          <dd className="text-white">
                            {hazard.latitude !== null && hazard.longitude !== null
                              ? `${hazard.latitude.toFixed(5)}, ${hazard.longitude.toFixed(5)}`
                              : 'No location'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-neutral-400 text-xs">Portage</dt>
                          <dd className="text-white">
                            {hazard.portageRequired ? `Required${hazard.portageSide ? `, ${hazard.portageSide} side` : ''}` : 'Not required'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-neutral-400 text-xs">Added</dt>
                          <dd className="text-white">{new Date(hazard.createdAt).toLocaleDateString()}</dd>
                        </div>
                        <div>
                          <dt className="text-neutral-400 text-xs">Last checked or edited</dt>
                          <dd className="text-white">{new Date(hazard.updatedAt).toLocaleDateString()}</dd>
                        </div>
                      </dl>
                      {hazard.description && (
                        <div>
                          <p className="text-neutral-400 text-xs">Description</p>
                          <p className="text-white text-sm whitespace-pre-wrap">{hazard.description}</p>
                        </div>
                      )}
                      {hazard.seasonalNotes && (
                        <div>
                          <p className="text-neutral-400 text-xs">Seasonal notes</p>
                          <p className="text-white text-sm whitespace-pre-wrap">{hazard.seasonalNotes}</p>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-2 pt-2">
                        <button
                          onClick={() => setEditing(hazard.id)}
                          disabled={busy === hazard.id}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm admin-secondary disabled:opacity-50"
                        >
                          <Pencil className="w-4 h-4" />
                          Edit
                        </button>
                        {hazard.active ? (
                          <>
                            <button
                              onClick={() => void quick(hazard, { confirmCurrent: true }, `${hazard.name} marked as checked today`)}
                              disabled={busy === hazard.id}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm admin-secondary disabled:opacity-50"
                            >
                              <CheckCircle className="w-4 h-4" />
                              Still there
                            </button>
                            <button
                              onClick={() => void quick(hazard, { active: false }, `${hazard.name} retired. Paddlers are no longer warned.`)}
                              disabled={busy === hazard.id}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm admin-secondary disabled:opacity-50"
                            >
                              <Archive className="w-4 h-4" />
                              Retire
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => void quick(hazard, { active: true }, `${hazard.name} is active again`)}
                            disabled={busy === hazard.id}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm admin-secondary disabled:opacity-50"
                          >
                            <RotateCcw className="w-4 h-4" />
                            Make active
                          </button>
                        )}
                        <button
                          onClick={() => void deleteHazard(hazard)}
                          disabled={busy === hazard.id}
                          className="flex items-center gap-2 px-3 py-1.5 text-red-400 hover:bg-red-500/10 rounded-lg text-sm ml-auto disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <ListPager page={page} total={total} pageSize={PAGE_SIZE} noun="hazards" onPage={setPage} />
      </div>
    </AdminLayout>
  );
}
