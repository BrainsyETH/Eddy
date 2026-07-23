'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Check, ChevronDown, ChevronUp, Eye, Share2, Sparkles } from 'lucide-react';
import { EDDY_IMAGES } from '@/constants';
import type { EddyTakeSections } from '@/lib/eddy/take-sections';

interface EddyOutlookFooterProps {
  riverSlug: string;
  sections: EddyTakeSections;
  isGuidance: boolean;
  fullReportText: string;
  fullReportLoading: boolean;
  fullReportIsGenerated: boolean;
  eddyReadIsGenerated: boolean;
  generatedAt?: string | null;
  gaugeName?: string | null;
  isOpen: boolean;
  onToggle: () => void;
  shareStatus: 'idle' | 'copied';
  onShare: () => void;
}

function updatedLabel(generatedAt: string): string {
  const diffMs = Date.now() - new Date(generatedAt).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Updated just now';
  if (mins < 60) return `Updated ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 2) return 'Updated 1 hr ago';
  if (hours < 24) return `Updated ${hours} hrs ago`;
  return `Updated ${Math.floor(hours / 24)}d ago`;
}

export default function EddyOutlookFooter({
  riverSlug,
  sections,
  isGuidance,
  fullReportText,
  fullReportLoading,
  fullReportIsGenerated,
  eddyReadIsGenerated,
  generatedAt,
  gaugeName,
  isOpen,
  onToggle,
  shareStatus,
  onShare,
}: EddyOutlookFooterProps) {
  return (
    <section id="eddy-says" className="scroll-mt-24 border-t-2 border-primary-200 bg-white" aria-labelledby="eddy-outlook-heading">
      <div className="flex items-center justify-between gap-3 border-b-2 border-primary-100 bg-white px-4 py-2 sm:px-5">
        <h3 id="eddy-outlook-heading" className="font-sans text-xs font-bold uppercase tracking-wide text-primary-800">
          Eddy&apos;s take
        </h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls="eddy-take-content"
          className="inline-flex items-center gap-1 rounded-sm text-xs font-semibold text-neutral-600 transition-colors hover:text-primary-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
        >
          {isOpen ? <>Show take <ChevronUp className="h-3 w-3" /></> : <>Full report <ChevronDown className="h-3 w-3" /></>}
        </button>
      </div>

      {isOpen ? (
        <div id="eddy-take-content" className="bg-white px-4 py-4 sm:px-5">
          {fullReportLoading ? (
            <p className="text-sm italic text-neutral-500">Loading Eddy&apos;s full report…</p>
          ) : (
            <p className="text-sm font-medium leading-relaxed text-neutral-700">{fullReportText}</p>
          )}
          {!fullReportLoading && (
            <p className="mt-2 text-[10px] text-neutral-400">
              {fullReportIsGenerated && generatedAt ? updatedLabel(generatedAt) : 'Generated report unavailable · Live guidance shown'}
              {gaugeName ? ' · ' : null}
              {gaugeName ? `via ${gaugeName}` : null}
            </p>
          )}
        </div>
      ) : (
      <div id="eddy-take-content" className="grid grid-cols-1 divide-y-2 divide-primary-100 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] lg:divide-x-2 lg:divide-y-0">
        <article className="min-w-0 border-l-4 border-accent-500 bg-white px-4 py-4 sm:px-5 lg:border-l-0 lg:border-t-4">
          <div className="mb-2 flex items-center gap-2 text-accent-800">
            <Image src={EDDY_IMAGES.favicon} alt="" width={20} height={20} className="h-5 w-5 object-contain" />
            <h4 className="font-sans text-xs font-bold uppercase tracking-wide">Bottom line</h4>
          </div>
          <p className="font-display text-base font-semibold leading-relaxed text-neutral-900" aria-live="polite">{sections.bottomLine}</p>
        </article>

        <article className="min-w-0 px-4 py-4 sm:px-5">
          <div className="mb-2 flex items-center gap-2 text-primary-800">
            <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            <h4 className="font-sans text-xs font-bold uppercase tracking-wide">Eddy&apos;s read</h4>
            <span className="text-[9px] font-semibold uppercase tracking-wide text-neutral-400">
              {eddyReadIsGenerated ? 'AI' : 'Live guidance'}
            </span>
          </div>
          <p className="text-sm font-medium leading-relaxed text-neutral-700">{sections.eddyRead}</p>
        </article>

        <article className="min-w-0 px-4 py-4 sm:px-5">
          <div className="mb-2 flex items-center gap-2 text-primary-800">
            <Eye className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            <h4 className="font-sans text-xs font-bold uppercase tracking-wide">Watch for</h4>
          </div>
          <p className="text-sm font-medium leading-relaxed text-neutral-700">{sections.watchFor}</p>
          {isGuidance && (
            <p className="mt-1 text-[10px] font-medium text-neutral-500">Weather outlook; future river levels are not predicted.</p>
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
          <button
            type="button"
            onClick={onShare}
            className="inline-flex items-center gap-1.5 rounded-md border-2 border-primary-700 bg-white px-3.5 py-1.5 text-xs font-semibold text-primary-900 shadow-[2px_2px_0_var(--color-primary-200)] transition-colors hover:bg-primary-50"
          >
            {shareStatus === 'copied' ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
            {shareStatus === 'copied' ? 'Copied!' : 'Share'}
          </button>
      </div>
    </section>
  );
}
