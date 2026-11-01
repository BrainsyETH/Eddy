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

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import Card from '@/components/ui/Card';
import { EddyIcon } from '@/components/ui/EddyIcon';
import { relativeAge } from '@shared/dam-schedule-copy';
import type { DamReadResponse } from '@shared/dam-types';

export default function DamEddyRead({ damId, damName, now }: { damId: string; damName: string; now: number }) {
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/dam-update/${encodeURIComponent(damId)}`, { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<DamReadResponse>) : null))
      .then((data) => setGeneratedAt(data?.available ? data.generatedAt : null))
      .catch(() => setGeneratedAt(null));
    return () => controller.abort();
  }, [damId]);

  if (!generatedAt) return null;
  const age = relativeAge(generatedAt, now);

  return (
    <Card as="section" variant="panel" className="min-w-0 p-5 sm:p-6" aria-labelledby="dam-eddy-read-heading" data-dam-eddy-read>
      <div className="flex items-center gap-2">
        <EddyIcon name="ai" size={20} />
        <h2 id="dam-eddy-read-heading" className="flex-1 text-xl font-semibold text-primary-800" style={{ fontFamily: 'var(--font-display)' }}>
          Eddy&apos;s Read
        </h2>
        <Lock className="h-4 w-4 text-neutral-500" aria-label="Premium" />
      </div>
      <p className="mt-2 text-sm leading-relaxed text-neutral-700">
        When the units at {damName} usually come on lately, weekdays and weekends apart, how closely the posted schedule
        has held, and what today&apos;s plan means beside it. Written each day in the Eddy app with Premium.
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
