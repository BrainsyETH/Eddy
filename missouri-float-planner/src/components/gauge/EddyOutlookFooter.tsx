'use client';

import Image from 'next/image';
import { ArrowRight, Lock } from 'lucide-react';
import AppLink from '@/components/AppLink';
import { EddyIcon } from '@/components/ui/EddyIcon';
import type { EddyTakeSections } from '@/lib/eddy/take-sections';
import { DamReadTeaser } from '@/components/dam/DamEddyRead';
import { formatAgeFromTimestamp } from '@/lib/utils/reading-age';

interface EddyOutlookFooterProps {
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
  sections,
  readLoading,
  readIsGenerated,
  generatedAt,
  gaugeName,
  damRead = null,
}: EddyOutlookFooterProps) {
  const updatedLabel = generatedAt ? formatAgeFromTimestamp(generatedAt) : null;

  return (
    <section id="eddy-says" className="scroll-mt-24 border-t-2 border-primary-700 bg-secondary-50" aria-labelledby="eddy-outlook-heading" aria-describedby="eddy-read-access">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 bg-primary-800 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Image src="/icons/eddy-wave.png" alt="" width={40} height={46} className="h-11 w-auto shrink-0" />
          <h3 id="eddy-outlook-heading" className="font-display text-xl font-semibold text-white">
            Eddy&apos;s take
          </h3>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-300/50 bg-accent-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-accent-200">
          <Lock className="h-3 w-3" aria-hidden="true" />
          Premium
        </span>
      </div>
      <p id="eddy-read-access" className="sr-only">
        Eddy&apos;s Read and weather interpretation{damRead ? '' : ', including the bottom line,'} are available in the app with Eddy Premium.
      </p>

      {/* Only public summary/deterministic copy reaches this component. The
          blur is a visual teaser, not entitlement enforcement: the full Read
          remains server-gated. Keep blurred copy out of screen readers and
          search snippets; the labels and app action explain the locked state. */}
      <div id="eddy-take-content">
        <article className="min-w-0 border-b border-primary-100 px-4 py-4 sm:px-5">
          <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-primary-800">
            <EddyIcon name="ai" size={22} />
            <h4 className="font-sans text-xs font-bold uppercase tracking-wide">Eddy&apos;s read</h4>
          </div>
          {damRead ? (
            <DamReadTeaser key={damRead.damId} damId={damRead.damId} scheduleAbove={damRead.scheduleAbove} />
          ) : readLoading ? (
            <p className="text-sm italic text-neutral-500">Loading Eddy&apos;s read…</p>
          ) : (
            <>
              <p aria-hidden="true" data-nosnippet className="pointer-events-none select-none text-sm font-medium leading-relaxed text-neutral-700 opacity-60 blur-[5px] lg:text-base">{sections.eddyRead}</p>
              {/* Attribution belongs to model-written prose only. When the read
                  falls back to the deterministic line there is no author and no
                  write time to name, and stamping one on it would date a
                  sentence that is computed fresh on every render. */}
              {readIsGenerated && (
                <p className="mt-2 text-[11px] text-neutral-500">
                  {updatedLabel ? `Written ${updatedLabel}` : 'Generated report'}
                  {gaugeName ? ` · via ${gaugeName}` : null}
                </p>
              )}
            </>
          )}
        </article>

        {/* Weather and Bottom line are one or two sentences each, so they
            still pair on a wide viewport. */}
        <div className={`grid grid-cols-1 divide-y divide-primary-100 ${damRead ? '' : 'sm:grid-cols-2 sm:divide-x sm:divide-y-0'}`}>
          <article className="min-w-0 px-4 py-4 sm:px-5">
            <div className="mb-2 flex items-center gap-2 text-primary-800">
              <EddyIcon name="weather" size={22} />
              <h4 className="font-sans text-xs font-bold uppercase tracking-wide">Weather</h4>
            </div>
            <p aria-hidden="true" data-nosnippet className="pointer-events-none select-none text-sm font-medium leading-relaxed text-neutral-700 opacity-60 blur-[5px]">{sections.watchFor}</p>
          </article>

          {!damRead && (
          <article className="min-w-0 bg-accent-50 px-4 py-4 sm:px-5">
            <div className="mb-2 flex items-center gap-2 text-accent-800">
              <EddyIcon name="ai" size={22} />
              <h4 className="font-sans text-xs font-bold uppercase tracking-wide">Bottom line</h4>
            </div>
            <p aria-hidden="true" data-nosnippet className="pointer-events-none select-none font-display text-base font-semibold leading-relaxed text-neutral-900 opacity-60 blur-[5px]">{sections.bottomLine}</p>
          </article>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4 border-t-2 border-primary-700 bg-secondary-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-accent-300 bg-accent-100 text-accent-800">
            <Lock className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="font-display text-lg font-semibold text-primary-800">Read it in the app</p>
            <p className="text-xs text-neutral-600">Included with Eddy Premium.</p>
          </div>
        </div>
        <AppLink
          data-ga-event="app_landing_click"
          data-ga-label="river_eddy_read"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border-2 border-primary-800 bg-accent-500 px-4 py-3 text-center text-sm font-bold text-primary-900 shadow-primary transition-colors duration-fast hover:bg-accent-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-700 sm:shrink-0"
        >
          Get Eddy&apos;s full Read
          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
        </AppLink>
      </div>
    </section>
  );
}
