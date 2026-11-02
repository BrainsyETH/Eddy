'use client';

// src/components/dam/DamEddyRead.tsx
// Eddy's Read for a dam, on the web: a locked card that points to the app.
//
// The Read is Premium in its entirety (ADR 0017), and the web has no Premium
// sign-in, so the page renders what the public response carries: that a Read
// exists and when it was written. The same pattern as the river page's "Get
// Eddy's full read in the app". The measured pattern strip and the posted
// schedule above stay free and are the whole of the data the Read interprets.
//
// Renders nothing until the public response says a Read is available, so a dam
// with no Read, or one withheld because the schedule changed, draws no card.
//
// DamReadTeaser is the same teaser without a card, for the "Eddy's read" slot
// of a tailwater river's Eddy's take on the dam's own release tab
// (shared/dam-release-tab.ts), where the river Read could only say that no
// assessment is available.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import Card from '@/components/ui/Card';
import { EddyIcon } from '@/components/ui/EddyIcon';
import { relativeAge } from '@shared/dam-schedule-copy';
import type { DamReadResponse } from '@shared/dam-types';

const DAM_READ_PITCH = 'Today’s generation schedule, recent patterns, and how closely the schedule has held.';

type ReadState = { damId: string; generatedAt: string | null } | null;

/** When this dam's Read was written, or null; `loading` until the public check answers. */
function useDamReadWrittenAt(damId: string): { loading: boolean; generatedAt: string | null } {
  const [state, setState] = useState<ReadState>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/dam-update/${encodeURIComponent(damId)}`, { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<DamReadResponse>) : null))
      .then((data) => setState({ damId, generatedAt: data?.available ? data.generatedAt : null }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ damId, generatedAt: null });
      });
    return () => controller.abort();
  }, [damId]);

  // Keyed by dam, so switching tabs never shows the last dam's age.
  const current = state?.damId === damId ? state : null;
  return { loading: current === null, generatedAt: current?.generatedAt ?? null };
}

export default function DamEddyRead({ damId, damName, now }: { damId: string; damName: string; now: number }) {
  const { generatedAt } = useDamReadWrittenAt(damId);

  if (!generatedAt) return null;
  const age = relativeAge(generatedAt, now);

  return (
    <Card as="section" variant="panel" className="min-w-0 p-5 sm:p-6" aria-labelledby="dam-eddy-read-heading" data-dam-eddy-read>
      <div className="flex items-center gap-2">
        <EddyIcon name="ai" size={20} />
        <h2 id="dam-eddy-read-heading" className="flex-1 text-xl font-semibold text-primary-800" style={{ fontFamily: 'var(--font-display)' }}>
          Eddy&apos;s Read<span className="sr-only"> for {damName}</span>
        </h2>
        <Lock className="h-4 w-4 text-neutral-500" aria-label="Premium" />
      </div>
      <p className="mt-2 text-sm leading-relaxed text-neutral-700">
        {DAM_READ_PITCH} Written each day in the Eddy app with Premium.
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-2">
        <span className="text-xs text-neutral-500">{age ? `Written ${age}` : null}</span>
        <Link href="/app" className="text-xs font-semibold text-primary-800 underline decoration-1 underline-offset-2 hover:text-primary-600">
          Read it in the app
        </Link>
      </div>
    </Card>
  );
}

/**
 * The dam's Read, as the body of the river page's "Eddy's read" slot. The
 * footer of that panel already links to the app, so this carries no link.
 */
export function DamReadTeaser({ damId, scheduleAbove }: {
  damId: string;
  /** The card above leads with THIS dam's schedule (not another dam's on the same river). */
  scheduleAbove: boolean;
}) {
  const { loading, generatedAt } = useDamReadWrittenAt(damId);

  if (loading) return <p className="text-sm italic text-neutral-500">Loading Eddy&apos;s read…</p>;
  if (!generatedAt) {
    // Not "unavailable for this river": the dam may simply have no Read yet
    // today, or the schedule changed and the next hourly run has not rewritten it.
    return (
      <p className="text-sm font-medium leading-relaxed text-neutral-700">
        Eddy&apos;s Read of this dam&apos;s schedule isn&apos;t ready right now.
        {scheduleAbove ? ' The release and posted schedule above are current.' : null}
      </p>
    );
  }

  const age = relativeAge(generatedAt, Date.now());
  return (
    <div data-dam-read-teaser>
      <p className="flex items-start gap-2 text-sm font-medium leading-relaxed text-neutral-700 lg:text-base">
        <Lock className="mt-1 h-4 w-4 shrink-0 text-neutral-500" aria-label="Premium" />
        <span>{DAM_READ_PITCH} Written each day for this dam in the Eddy app with Premium.</span>
      </p>
      {age ? <p className="mt-2 text-[11px] text-neutral-500">Written {age}</p> : null}
    </div>
  );
}
