'use client';
// src/components/admin/HazardForm.tsx
// One form for creating and editing a river hazard. River mile is explicit:
// trip plans match hazards to a float by mile, so a hazard without one is
// never warned about. "Estimate" suggests a mile from the river's access
// points; the admin accepts or corrects it.

import { useState } from 'react';
import { Save } from 'lucide-react';
import { adminFetch } from '@/hooks/useAdminAuth';
import { useUnsavedAdminChanges } from '@/components/admin/AdminInteractionProvider';
import type { MileEstimate } from '@/lib/admin/hazards';

export interface HazardDraft {
  name: string;
  type: string;
  severity: string;
  riverId: string;
  latitude: string;
  longitude: string;
  riverMile: string;
  description: string;
  seasonalNotes: string;
  portageRequired: boolean;
  portageSide: string;
}

export const EMPTY_HAZARD: HazardDraft = {
  name: '',
  type: 'other',
  severity: 'caution',
  riverId: '',
  latitude: '',
  longitude: '',
  riverMile: '',
  description: '',
  seasonalNotes: '',
  portageRequired: false,
  portageSide: '',
};

export const HAZARD_TYPE_OPTIONS = [
  { value: 'low_water_dam', label: 'Low water dam' },
  { value: 'portage', label: 'Portage' },
  { value: 'strainer', label: 'Strainer' },
  { value: 'rapid', label: 'Rapid' },
  { value: 'private_property', label: 'Private property' },
  { value: 'waterfall', label: 'Waterfall' },
  { value: 'shoal', label: 'Shoal' },
  { value: 'bridge_piling', label: 'Bridge piling' },
  { value: 'other', label: 'Other' },
];

export const HAZARD_SEVERITY_OPTIONS = [
  { value: 'info', label: 'Info' },
  { value: 'caution', label: 'Caution' },
  { value: 'warning', label: 'Warning' },
  { value: 'danger', label: 'Danger' },
];

/** The API body for a draft. Blank optional fields are sent as null. */
export function hazardDraftBody(d: HazardDraft) {
  return {
    name: d.name.trim(),
    type: d.type,
    severity: d.severity,
    riverId: d.riverId,
    latitude: d.latitude === '' ? null : Number(d.latitude),
    longitude: d.longitude === '' ? null : Number(d.longitude),
    riverMileDownstream: d.riverMile === '' ? null : Number(d.riverMile),
    description: d.description.trim() || null,
    seasonalNotes: d.seasonalNotes.trim() || null,
    portageRequired: d.portageRequired,
    portageSide: d.portageSide || null,
  };
}

interface Props {
  /** Unique per form on the page, for label ids. */
  formId: string;
  initial: HazardDraft;
  rivers: { id: string; name: string }[];
  submitLabel: string;
  /** Editing a hazard that has no location yet: it can be saved without one. */
  locationOptional?: boolean;
  /** Resolve on success; reject with an Error whose message is shown. */
  onSubmit: (draft: HazardDraft) => Promise<void>;
  onCancel: () => void;
}

const field =
  'w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500';
const label = 'block text-sm text-neutral-300 mb-1';

export default function HazardForm({ formId, initial, rivers, submitLabel, locationOptional, onSubmit, onCancel }: Props) {
  const [draft, setDraft] = useState<HazardDraft>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<MileEstimate | null>(null);
  const [estimateNote, setEstimateNote] = useState<string | null>(null);
  const [estimating, setEstimating] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  useUnsavedAdminChanges(dirty);

  const set = <K extends keyof HazardDraft>(key: K, value: HazardDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const lat = Number(draft.latitude);
  const lng = Number(draft.longitude);
  const hasLocation =
    draft.latitude !== '' && draft.longitude !== '' && Number.isFinite(lat) && Number.isFinite(lng);
  const noLocation = draft.latitude === '' && draft.longitude === '';
  const ready = draft.name.trim() !== '' && draft.riverId !== '' && (hasLocation || (!!locationOptional && noLocation));

  const estimateMile = async () => {
    setEstimating(true);
    setEstimate(null);
    setEstimateNote(null);
    try {
      const res = await adminFetch(
        `/api/admin/hazards/mile-hint?${new URLSearchParams({ river: draft.riverId, lat: String(lat), lng: String(lng) })}`,
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not estimate a river mile.');
      if (data.estimate) setEstimate(data.estimate);
      else
        setEstimateNote(
          data.accessPoints < 2
            ? 'This river has too few access points with miles to estimate from. Enter the mile by hand.'
            : 'This location is too far from the river’s access points to estimate. Check the coordinates, or enter the mile by hand.',
        );
    } catch (err) {
      setEstimateNote(err instanceof Error ? err.message : 'Could not estimate a river mile.');
    } finally {
      setEstimating(false);
    }
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSubmit(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the hazard.');
    } finally {
      setSaving(false);
    }
  };

  const id = (name: string) => `${formId}-${name}`;

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor={id('name')} className={label}>
            Name *
          </label>
          <input
            id={id('name')}
            type="text"
            value={draft.name}
            maxLength={200}
            onChange={(e) => set('name', e.target.value)}
            className={field}
            placeholder="e.g., Marble Creek low water dam"
          />
        </div>
        <div>
          <label htmlFor={id('river')} className={label}>
            River *
          </label>
          <select id={id('river')} value={draft.riverId} onChange={(e) => set('riverId', e.target.value)} className={field}>
            <option value="">Select a river</option>
            {rivers.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={id('type')} className={label}>
            Type
          </label>
          <select id={id('type')} value={draft.type} onChange={(e) => set('type', e.target.value)} className={field}>
            {HAZARD_TYPE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={id('severity')} className={label}>
            Severity
          </label>
          <select id={id('severity')} value={draft.severity} onChange={(e) => set('severity', e.target.value)} className={field}>
            {HAZARD_SEVERITY_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={id('lat')} className={label}>
            Latitude *
          </label>
          <input
            id={id('lat')}
            type="number"
            step="0.000001"
            value={draft.latitude}
            onChange={(e) => set('latitude', e.target.value)}
            className={field}
            placeholder="37.123456"
          />
        </div>
        <div>
          <label htmlFor={id('lng')} className={label}>
            Longitude *
          </label>
          <input
            id={id('lng')}
            type="number"
            step="0.000001"
            value={draft.longitude}
            onChange={(e) => set('longitude', e.target.value)}
            className={field}
            placeholder="-91.123456"
          />
        </div>
        <div className="md:col-span-2">
          <label htmlFor={id('mile')} className={label}>
            River mile
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id={id('mile')}
              type="number"
              step="0.1"
              min="0"
              value={draft.riverMile}
              onChange={(e) => set('riverMile', e.target.value)}
              className={`${field} max-w-[10rem]`}
              placeholder="e.g., 31.4"
            />
            <button
              type="button"
              onClick={() => void estimateMile()}
              disabled={!draft.riverId || !hasLocation || estimating}
              className="px-3 py-2 rounded-lg text-sm admin-secondary disabled:opacity-50"
            >
              {estimating ? 'Estimating…' : 'Estimate from access points'}
            </button>
          </div>
          {draft.riverMile === '' && (
            <p className="mt-1 text-xs text-yellow-400">
              Without a river mile, trip plans can’t warn paddlers about this hazard.
            </p>
          )}
          {estimate && (
            <p className="mt-1 text-xs text-neutral-300">
              About mile {estimate.mile.toFixed(1)}, between {estimate.between[0].name} (mile{' '}
              {estimate.between[0].mile.toFixed(1)}) and {estimate.between[1].name} (mile{' '}
              {estimate.between[1].mile.toFixed(1)}). This is an estimate.{' '}
              <button
                type="button"
                onClick={() => set('riverMile', estimate.mile.toFixed(1))}
                className="underline text-primary-400"
              >
                Use {estimate.mile.toFixed(1)}
              </button>
            </p>
          )}
          {estimateNote && <p className="mt-1 text-xs text-yellow-400">{estimateNote}</p>}
        </div>
        <div className="md:col-span-2">
          <label htmlFor={id('description')} className={label}>
            Description
          </label>
          <textarea
            id={id('description')}
            value={draft.description}
            onChange={(e) => set('description', e.target.value)}
            rows={2}
            maxLength={4000}
            className={field}
            placeholder="What it is and how to get past it"
          />
        </div>
        <div className="md:col-span-2">
          <label htmlFor={id('seasonal')} className={label}>
            Seasonal notes
          </label>
          <textarea
            id={id('seasonal')}
            value={draft.seasonalNotes}
            onChange={(e) => set('seasonalNotes', e.target.value)}
            rows={2}
            maxLength={2000}
            className={field}
            placeholder="e.g., Only a problem below 2 ft"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.portageRequired}
            onChange={(e) => set('portageRequired', e.target.checked)}
          />
          Portage required
        </label>
        <div>
          <label htmlFor={id('side')} className={label}>
            Portage side
          </label>
          <select id={id('side')} value={draft.portageSide} onChange={(e) => set('portageSide', e.target.value)} className={field}>
            <option value="">Not set</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
            <option value="either">Either</option>
          </select>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3 mt-4">
        <button
          onClick={() => void submit()}
          disabled={saving || !ready}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm rounded-lg disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving…' : submitLabel}
        </button>
        <button onClick={onCancel} disabled={saving} className="px-4 py-2 rounded-lg text-sm admin-secondary">
          Cancel
        </button>
        {!ready && <span className="text-xs text-neutral-400">Name, river and location are required.</span>}
      </div>
    </div>
  );
}
