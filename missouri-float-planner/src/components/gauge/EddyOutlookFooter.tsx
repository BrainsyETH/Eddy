'use client';

import Image from 'next/image';
import { ArrowRight, Lock } from 'lucide-react';
import AppLink from '@/components/AppLink';
import { distinctReadContext, readPreview } from '@shared/read-presentation';
import type { EddyTakeSections } from '@/lib/eddy/take-sections';
import { DamReadTeaser } from '@/components/dam/DamEddyRead';
import { formatAgeFromTimestamp } from '@/lib/utils/reading-age';

interface EddyOutlookFooterProps {
  /** Section reports use one public summary with the existing Premium app link. */
  compact?: boolean;
  sections: EddyTakeSections;
  readLoading: boolean;
  /** Only a model-written read earns the attribution line; see below. */
  readIsGenerated: boolean;
  generatedAt?: string | null;
  gaugeName?: string | null;
  /**
   * Set on a dam's own unrated release (shared/dam-release-tab.ts): the Read
   * slot is the dam's Read, and Bottom line is dropped. On that tab the river
   * Read can only say no assessment is available and the bottom line only that
   * there is not enough data, while the dam has a Read of its schedule.
   * Weather stays: storms, wind and cold still decide a float day.
   */
  damRead?: { damId: string; scheduleAbove: boolean } | null;
}

export default function EddyOutlookFooter({
  compact = false, sections, readLoading, readIsGenerated, generatedAt, gaugeName, damRead = null,
}: EddyOutlookFooterProps) {
  const updatedLabel = generatedAt ? formatAgeFromTimestamp(generatedAt) : null;
  const weather = distinctReadContext(sections.eddyRead, sections.watchFor);
  const bottomLine = distinctReadContext(`${sections.eddyRead} ${weather ?? ''}`, sections.bottomLine);
  return (
    <section id="eddy-says" className="scroll-mt-24 border-b border-secondary-200 bg-secondary-50 px-4 py-4 sm:px-5" aria-labelledby="eddy-outlook-heading" aria-describedby="eddy-read-access">
      <div className="flex items-start gap-3">
        <Image src="/icons/eddy-wave.png" alt="" width={40} height={46} className="h-11 w-auto shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 id="eddy-outlook-heading" className="font-display text-xl font-semibold text-primary-800">Eddy&apos;s Read</h3>
          <p id="eddy-read-access" className="sr-only">The full Read and weather interpretation are available in the app with Eddy Premium.</p>
          {damRead ? <DamReadTeaser key={damRead.damId} damId={damRead.damId} scheduleAbove={damRead.scheduleAbove} />
            : readLoading ? <p className="mt-1 text-sm text-neutral-600">Loading Eddy’s Read…</p>
            : compact ? <p className="mt-1 text-sm leading-relaxed text-neutral-700">{readPreview(sections.eddyRead)}</p>
            : <p aria-hidden="true" data-nosnippet className="pointer-events-none mt-1 select-none text-sm leading-relaxed text-neutral-700 opacity-60 blur-[5px]">{readPreview(sections.eddyRead)}</p>}
          {readIsGenerated && <p className="mt-1 text-xs text-neutral-500">{updatedLabel ? `Written ${updatedLabel}` : 'Generated report'}{gaugeName ? ` · via ${gaugeName}` : ''}</p>}
          {!compact && (weather || (!damRead && bottomLine)) && (
            <div className="mt-3" aria-hidden="true">
              {/* Presentation only; paid prose remains server-gated. */}
              {weather && <div className="mb-3"><h4 className="text-xs font-semibold text-neutral-600">Weather</h4>
                <p aria-hidden="true" data-nosnippet className="pointer-events-none select-none text-sm text-neutral-700 opacity-60 blur-[5px]">{weather}</p></div>}
              {!damRead && bottomLine && <div><h4 className="text-xs font-semibold text-neutral-600">Bottom line</h4>
                <p aria-hidden="true" data-nosnippet className="pointer-events-none select-none text-sm text-neutral-700 opacity-60 blur-[5px]">{bottomLine}</p></div>}
            </div>
          )}
        </div>
      </div>
      <AppLink data-ga-event="app_landing_click" data-ga-label="river_eddy_read"
        className="mt-3 flex w-full sm:w-fit min-h-11 items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-center text-sm font-semibold text-primary-800 hover:bg-secondary-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700">
        <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />Get Eddy&apos;s full Read in the app<ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
      </AppLink>
    </section>
  );
}
