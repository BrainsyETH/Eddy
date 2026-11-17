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
// River pages use useDamReadWrittenAt for their compact, source-specific Read
// link below the forecast. This card remains on standalone dam pages.

import { useEffect, useState } from 'react';
import ReadAppLink from '@/components/ReadAppLink';
import Image from 'next/image';
import { Lock } from 'lucide-react';
import Card from '@/components/ui/Card';
import { EDDY_IMAGES } from '@/constants';
import { relativeAgeShort } from '@shared/dam-schedule-copy';
import type { DamReadResponse } from '@shared/dam-types';

const DAM_READ_PITCH = 'What stands out in today’s generation schedule.';

type ReadState = { damId: string; generatedAt: string | null } | null;

/** When this dam's Read was written, or null; `loading` until the public check answers. */
export function useDamReadWrittenAt(damId: string | null): { loading: boolean; generatedAt: string | null } {
  const [state, setState] = useState<ReadState>(null);

  useEffect(() => {
    if (!damId) return;
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
  return { loading: damId !== null && current === null, generatedAt: current?.generatedAt ?? null };
}

export default function DamEddyRead({ damId, damName, now }: { damId: string; damName: string; now: number }) {
  const { generatedAt } = useDamReadWrittenAt(damId);

  if (!generatedAt) return null;
  const age = relativeAgeShort(generatedAt, now);

  return (
    <Card as="section" variant="framed" className="min-w-0 p-4 sm:p-5" aria-labelledby="dam-eddy-read-heading" data-dam-eddy-read>
      <div className="flex items-center gap-2">
        <Image src={EDDY_IMAGES.favicon} alt="" width={28} height={28} className="shrink-0 object-contain" />
        <h2 id="dam-eddy-read-heading" className="flex-1 text-xl font-semibold text-primary-800" style={{ fontFamily: 'var(--font-display)' }}>
          Eddy&apos;s Read<span className="sr-only"> for {damName}</span>
        </h2>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-neutral-700">
        {DAM_READ_PITCH}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className="text-xs text-neutral-600">{age ? `Updated ${age}` : null}</span>
        <ReadAppLink destination={{ kind: 'dam', id: damId }} label="dam_eddy_read" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary-800 underline decoration-1 underline-offset-2 hover:text-primary-600">
          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Read with Eddy Premium
        </ReadAppLink>
      </div>
    </Card>
  );
}
