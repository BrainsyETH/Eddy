'use client';
// src/components/admin/ReportedPhotoPanel.tsx
// Shown inside a "Reported Photo" feedback item: the photo, where it is live,
// and the takedown actions, so a moderator can act without leaving the inbox.
// Both actions go through the same report route as the Reports page, which
// owns the storage side (see src/lib/uploads/apply-media-transitions.ts).

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { EyeOff, ExternalLink, Trash2 } from 'lucide-react';
import { adminFetch } from '@/hooks/useAdminAuth';
import { useAdminInteractions } from '@/components/admin/AdminInteractionProvider';
import type { ReportedPhotoContext } from '@/lib/feedback/admin';

type ReportState = 'pending' | 'verified' | 'rejected';

interface LoadedReport {
  status: ReportState;
  imageUrl: string | null;
  riverName: string | null;
}

const STATE_TEXT: Record<ReportState, { label: string; detail: string; tone: string }> = {
  verified: {
    label: 'Live in the app',
    detail: 'People can see this photo now.',
    tone: 'bg-red-600 text-white',
  },
  pending: {
    label: 'Hidden — in review',
    detail: 'Not shown in the app. The file is kept so it can be restored.',
    tone: 'bg-amber-500 text-white',
  },
  rejected: {
    label: 'Removed',
    detail: 'The photo was deleted and is no longer available.',
    tone: 'bg-neutral-500 text-white',
  },
};

interface Props {
  photo: ReportedPhotoContext;
  /** Called after a takedown succeeds, so the item can be marked resolved. */
  onTakenDown: (action: 'hidden' | 'removed') => void;
}

export default function ReportedPhotoPanel({ photo, onTakenDown }: Props) {
  const { confirm } = useAdminInteractions();
  const [report, setReport] = useState<LoadedReport | null>(null);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [acting, setActing] = useState<ReportState | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await adminFetch(`/api/admin/reports/${photo.reportId}`);
      if (res.status === 404) {
        setMissing(true);
        return;
      }
      if (!res.ok) throw new Error();
      const { report: r } = await res.json();
      setReport({ status: r.status, imageUrl: r.imageUrl, riverName: r.riverName });
    } catch {
      setLoadError('Could not load the reported photo.');
    }
  }, [photo.reportId]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (status: 'pending' | 'rejected') => {
    if (
      status === 'rejected' &&
      !(await confirm(
        'Remove this photo permanently? It is deleted from storage and cannot be restored.',
        { confirmLabel: 'Remove photo', danger: true },
      ))
    )
      return;
    setActing(status);
    setActionError(null);
    try {
      const res = await adminFetch(`/api/admin/reports/${photo.reportId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'The photo was not changed.');
      }
      await load();
      onTakenDown(status === 'pending' ? 'hidden' : 'removed');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'The photo was not changed.');
    } finally {
      setActing(null);
    }
  };

  const state = report ? STATE_TEXT[report.status] : null;
  // The report's own URL is current; the one in the flag is what the reporter saw.
  const preview = report?.status === 'rejected' ? null : report?.imageUrl ?? photo.imageUrl;

  return (
    <section
      aria-label="Reported photo"
      className="mb-4 rounded-lg border border-red-300 bg-neutral-900 p-3"
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt={photo.description ?? 'Reported community photo'}
            className="h-40 w-full rounded-md object-cover sm:w-56"
          />
        ) : (
          <div className="flex h-40 w-full items-center justify-center rounded-md bg-neutral-700 text-xs text-neutral-400 sm:w-56">
            No preview
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-2 text-sm">
          {state ? (
            <div>
              <span className={`inline-block rounded px-2 py-1 text-xs font-medium ${state.tone}`}>
                {state.label}
              </span>
              <p className="mt-1 text-xs text-neutral-400">{state.detail}</p>
            </div>
          ) : missing ? (
            <p className="text-neutral-300">This photo&rsquo;s report no longer exists.</p>
          ) : loadError ? (
            <p role="alert" className="text-red-400">
              {loadError}{' '}
              <button onClick={() => void load()} className="underline">
                Try again
              </button>
            </p>
          ) : (
            <p className="text-neutral-400">Checking where this photo is shown…</p>
          )}
          {(photo.accessPointName || report?.riverName) && (
            <p className="text-neutral-300">
              {[photo.accessPointName, report?.riverName].filter(Boolean).join(' · ')}
            </p>
          )}
          {photo.description && <p className="text-neutral-300">“{photo.description}”</p>}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {report?.status === 'verified' && (
              <button
                onClick={() => void act('pending')}
                disabled={acting !== null}
                className="flex items-center gap-1 rounded px-3 py-1.5 text-xs font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
              >
                <EyeOff className="h-3 w-3" />
                {acting === 'pending' ? 'Hiding…' : 'Hide photo'}
              </button>
            )}
            {report && report.status !== 'rejected' && (
              <button
                onClick={() => void act('rejected')}
                disabled={acting !== null}
                className="flex items-center gap-1 rounded px-3 py-1.5 text-xs font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                <Trash2 className="h-3 w-3" />
                {acting === 'rejected' ? 'Removing…' : 'Remove photo'}
              </button>
            )}
            {!missing && (
              <Link
                href={`/admin/reports?id=${photo.reportId}`}
                className="flex items-center gap-1 rounded px-3 py-1.5 text-xs font-medium admin-secondary"
              >
                <ExternalLink className="h-3 w-3" />
                Open in Reports
              </Link>
            )}
          </div>
          {actionError && (
            <p role="alert" className="text-xs text-red-400">
              {actionError}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
