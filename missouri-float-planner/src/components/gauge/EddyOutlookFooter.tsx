'use client';

import Link from 'next/link';
import { ChevronDown, ChevronUp, Eye, Sparkles } from 'lucide-react';
import { EddyIcon } from '@/components/ui/EddyIcon';
import type { EddyTakeSections } from '@/lib/eddy/take-sections';
import { formatAgeFromTimestamp } from '@/lib/utils/reading-age';

interface EddyOutlookFooterProps {
  riverSlug: string;
  sections: EddyTakeSections;
  isGuidance: boolean;
  fullReportText: string;
  fullReportLoading: boolean;
  /** Only a model-written report earns the expander; see hasFullReport below. */
  fullReportIsGenerated: boolean;
  generatedAt?: string | null;
  gaugeName?: string | null;
  isOpen: boolean;
  onToggle: () => void;
}

export default function EddyOutlookFooter({
  riverSlug,
  sections,
  isGuidance,
  fullReportText,
  fullReportLoading,
  fullReportIsGenerated,
  generatedAt,
  gaugeName,
  isOpen,
  onToggle,
}: EddyOutlookFooterProps) {
  // Without a generated report the "full report" was the three sections below
  // re-pasted into one paragraph — an expander that promised more and returned
  // the same words. Offer it only when there is genuinely more to read.
  const hasFullReport = fullReportIsGenerated || fullReportLoading;
  const expanded = isOpen && hasFullReport;
  const updatedLabel = generatedAt ? formatAgeFromTimestamp(generatedAt) : null;

  return (
    <section id="eddy-says" className="scroll-mt-24 border-t-2 border-primary-200 bg-white" aria-labelledby="eddy-outlook-heading">
      <div className="flex items-center justify-between gap-3 border-b-2 border-primary-100 bg-white px-4 py-2 sm:px-5">
        <h3 id="eddy-outlook-heading" className="font-sans text-xs font-bold uppercase tracking-wide text-primary-800">
          Eddy&apos;s take
        </h3>
        {hasFullReport && (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-controls="eddy-take-content"
            className="inline-flex items-center gap-1 rounded-sm text-xs font-semibold text-neutral-600 transition-colors hover:text-primary-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
          >
            {expanded
              ? <>Show summary <ChevronUp className="h-3 w-3" /></>
              : <>Full report <ChevronDown className="h-3 w-3" /></>}
          </button>
        )}
      </div>

      {expanded ? (
        <div id="eddy-take-content" className="bg-white px-4 py-4 sm:px-5">
          {fullReportLoading ? (
            <p className="text-sm italic text-neutral-500">Loading Eddy&apos;s full report…</p>
          ) : (
            <>
              <p className="text-sm font-medium leading-relaxed text-neutral-700">{fullReportText}</p>
              <p className="mt-2 text-[11px] text-neutral-500">
                {updatedLabel ? `Written ${updatedLabel}` : 'Generated report'}
                {gaugeName ? ` · via ${gaugeName}` : null}
              </p>
            </>
          )}
        </div>
      ) : (
      // Eddy's read takes the wide middle column on desktop; Bottom line and
      // Watch for flank it at equal, narrower width. Mobile keeps the stacked
      // order with Bottom line leading.
      <div id="eddy-take-content" className="grid grid-cols-1 divide-y-2 divide-primary-100 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] lg:divide-x-2 lg:divide-y-0">
        <article className="min-w-0 border-l-4 border-accent-500 bg-white px-4 py-4 sm:px-5 lg:border-l-0 lg:border-t-4">
          <div className="mb-2 flex items-center gap-2 text-accent-800">
            {/* The AI mark, not the mascot's head. Every word in this section
                is model-written — the heading above says "Eddy's take" — and
                the catalog draws that as its own symbol. The condition otters
                stay where a condition is being reported. */}
            <EddyIcon name="ai" size={20} />
            <h4 className="font-sans text-xs font-bold uppercase tracking-wide">Bottom line</h4>
          </div>
          {/* Type tracks the column width, so the narrow box does not end up
              with larger text than the wide one beside it. */}
          <p className="font-display text-base font-semibold leading-relaxed text-neutral-900 lg:text-sm" aria-live="polite">{sections.bottomLine}</p>
        </article>

        <article className="min-w-0 px-4 py-4 sm:px-5">
          <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-primary-800">
            <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            <h4 className="font-sans text-xs font-bold uppercase tracking-wide">Eddy&apos;s read</h4>
          </div>
          <p className="text-sm font-medium leading-relaxed text-neutral-700 lg:text-base">{sections.eddyRead}</p>
        </article>

        <article className="min-w-0 px-4 py-4 sm:px-5">
          <div className="mb-2 flex items-center gap-2 text-primary-800">
            <Eye className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            <h4 className="font-sans text-xs font-bold uppercase tracking-wide">Watch for</h4>
          </div>
          <p className="text-sm font-medium leading-relaxed text-neutral-700">{sections.watchFor}</p>
          {isGuidance && (
            {/* `isGuidance` means this river has no official hydrograph, so the
                strip above is weather and nothing else. Kept because without it
                a reader can take it for a level forecast. Must stay word for
                word identical to the iOS twin in EddyTake.tsx — one claim, two
                platforms. */}
            <p className="mt-1 text-[10px] font-medium text-neutral-500">Weather only — no river-level forecast.</p>
          )}
        </article>
      </div>
      )}

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
