'use client';

import Image from 'next/image';
import type { AppDestination } from '@/lib/app-destination';
import ReportAppCta from './ReportAppCta';
import { distinctReadContext, readPreview } from '@shared/read-presentation';
import type { EddyTakeSections } from '@/lib/eddy/take-sections';
import { DamReadTeaser, useDamReadWrittenAt } from '@/components/dam/DamEddyRead';
import { formatAgeFromTimestamp } from '@/lib/utils/reading-age';

interface EddyOutlookFooterProps {
  destination?: AppDestination;
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
  destination, compact = false, sections, readLoading, readIsGenerated, generatedAt, gaugeName, damRead = null,
}: EddyOutlookFooterProps) {
  const damReadState = useDamReadWrittenAt(damRead?.damId ?? null);
  const hasRead = damRead ? Boolean(damReadState.generatedAt) : readIsGenerated;
  const updatedLabel = generatedAt ? formatAgeFromTimestamp(generatedAt) : null;
  const weather = distinctReadContext(sections.eddyRead, sections.watchFor);
  const bottomLine = distinctReadContext(`${sections.eddyRead} ${weather ?? ''}`, sections.bottomLine);
  return (
    <section id="eddy-says" className="scroll-mt-24 border-b border-secondary-200 bg-secondary-50 px-4 py-4 sm:px-5" aria-labelledby="eddy-outlook-heading" aria-describedby={hasRead ? 'eddy-read-access' : undefined}>
      <div className="flex items-start gap-3">
        <Image src="/icons/eddy-wave.png" alt="" width={40} height={46} className="h-11 w-auto shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 id="eddy-outlook-heading" className="font-display text-xl font-semibold text-primary-800">Eddy&apos;s Read</h3>
          {hasRead && <p id="eddy-read-access" className="sr-only">The full Read and weather interpretation are available in the iPhone app with Eddy Premium.</p>}
          {damRead ? <DamReadTeaser {...damReadState} scheduleAbove={damRead.scheduleAbove} />
            : readLoading ? <p className="mt-1 text-sm text-neutral-600">Loading Eddy’s Read…</p>
            : compact ? <p className="mt-1 text-sm leading-relaxed text-neutral-700">{readPreview(sections.eddyRead)}</p>
            : <p aria-hidden="true" data-nosnippet className="pointer-events-none mt-1 select-none text-sm leading-relaxed text-neutral-700 opacity-60 blur-[5px]">{readPreview(sections.eddyRead)}</p>}
          {readIsGenerated && <p className="mt-1 text-xs text-neutral-500">{updatedLabel ? `Written ${updatedLabel}` : 'Generated report'}{gaugeName ? ` · via ${gaugeName}` : ''}</p>}
          {!compact && (weather || (!damRead && bottomLine)) && (
            <div className="mt-3 space-y-3" aria-hidden="true">
              {/* Presentation only; paid prose remains server-gated. */}
              {weather && <div className="border-t border-secondary-200 pt-3"><h4 className="text-xs font-semibold text-neutral-600">Weather</h4>
                <p aria-hidden="true" data-nosnippet className="pointer-events-none select-none text-sm text-neutral-700 opacity-60 blur-[5px]">{weather}</p></div>}
              {!damRead && bottomLine && <div className="border-t border-secondary-200 pt-3"><h4 className="text-xs font-semibold text-neutral-600">Bottom line</h4>
                <p aria-hidden="true" data-nosnippet className="pointer-events-none select-none text-sm text-neutral-700 opacity-60 blur-[5px]">{bottomLine}</p></div>}
            </div>
          )}
        </div>
      </div>
      <ReportAppCta destination={destination} hasRead={hasRead} loading={damRead ? damReadState.loading : readLoading} />
    </section>
  );
}
