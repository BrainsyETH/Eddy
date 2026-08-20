'use client';

import Link from 'next/link';
import { Eye, Sparkles } from 'lucide-react';
import { EddyIcon } from '@/components/ui/EddyIcon';
import type { EddyTakeSections } from '@/lib/eddy/take-sections';
import { formatAgeFromTimestamp } from '@/lib/utils/reading-age';

interface EddyOutlookFooterProps {
  riverSlug: string;
  sections: EddyTakeSections;
  isGuidance: boolean;
  readLoading: boolean;
  /** Only a model-written read earns the attribution line; see below. */
  readIsGenerated: boolean;
  generatedAt?: string | null;
  gaugeName?: string | null;
}

export default function EddyOutlookFooter({
  riverSlug,
  sections,
  isGuidance,
  readLoading,
  readIsGenerated,
  generatedAt,
  gaugeName,
}: EddyOutlookFooterProps) {
  const updatedLabel = generatedAt ? formatAgeFromTimestamp(generatedAt) : null;

  return (
    <section id="eddy-says" className="scroll-mt-24 border-t-2 border-primary-200 bg-white" aria-labelledby="eddy-outlook-heading">
      <div className="flex items-center justify-between gap-3 border-b-2 border-primary-100 bg-white px-4 py-2 sm:px-5">
        <h3 id="eddy-outlook-heading" className="font-sans text-xs font-bold uppercase tracking-wide text-primary-800">
          Eddy&apos;s take
        </h3>
      </div>

      {/* The order is the app's: the read leads, Watch for follows, Bottom line
          closes as the conclusion of the two above it (eddy-ios EddyTake.tsx).
          Eddy's read carries the full model report now, which runs to several
          sentences — it gets the full width rather than the middle cell of a
          three-column strip sized for one line. */}
      <div id="eddy-take-content">
        <article className="min-w-0 border-b-2 border-primary-100 px-4 py-4 sm:px-5">
          <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-primary-800">
            <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            <h4 className="font-sans text-xs font-bold uppercase tracking-wide">Eddy&apos;s read</h4>
          </div>
          {readLoading ? (
            <p className="text-sm italic text-neutral-500">Loading Eddy&apos;s read…</p>
          ) : (
            <>
              <p className="text-sm font-medium leading-relaxed text-neutral-700 lg:text-base">{sections.eddyRead}</p>
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

        {/* Watch for and Bottom line are one or two sentences each, so they
            still pair on a wide viewport. */}
        <div className="grid grid-cols-1 divide-y-2 divide-primary-100 lg:grid-cols-2 lg:divide-x-2 lg:divide-y-0">
          <article className="min-w-0 px-4 py-4 sm:px-5">
            <div className="mb-2 flex items-center gap-2 text-primary-800">
              <Eye className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              <h4 className="font-sans text-xs font-bold uppercase tracking-wide">Watch for</h4>
            </div>
            <p className="text-sm font-medium leading-relaxed text-neutral-700">{sections.watchFor}</p>
            {/* `isGuidance` means this river has no official hydrograph, so the
                strip above is weather and nothing else. Kept because without it a
                reader can take it for a level forecast. Must stay word for word
                identical to the iOS twin in EddyTake.tsx — one claim, two
                platforms, pinned by outlook-guidance-caveat.test.ts. */}
            {isGuidance && (
              <p className="mt-1 text-[10px] font-medium text-neutral-500">Weather only — no river-level forecast.</p>
            )}
          </article>

          <article className="min-w-0 border-l-4 border-accent-500 bg-white px-4 py-4 sm:px-5 lg:border-l-0 lg:border-t-4">
            <div className="mb-2 flex items-center gap-2 text-accent-800">
              {/* The AI mark, not the mascot's head. Every word in this section
                  is model-written — the heading above says "Eddy's take" — and
                  the catalog draws that as its own symbol. The condition otters
                  stay where a condition is being reported. */}
              <EddyIcon name="ai" size={20} />
              <h4 className="font-sans text-xs font-bold uppercase tracking-wide">Bottom line</h4>
            </div>
            <p className="font-display text-base font-semibold leading-relaxed text-neutral-900" aria-live="polite">{sections.bottomLine}</p>
          </article>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t-2 border-primary-100 bg-white px-4 py-3 sm:px-5">
          <Link
            href={`/plan?river=${riverSlug}`}
            className="inline-flex items-center gap-1.5 rounded-md border-2 border-primary-900 bg-primary-800 px-3.5 py-1.5 text-xs font-semibold text-white shadow-[2px_2px_0_var(--color-primary-900)] transition-colors hover:bg-primary-700"
          >
            Plan a Trip
          </Link>
      </div>
    </section>
  );
}
