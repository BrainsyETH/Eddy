'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Check, ChevronDown, ChevronUp, Share2 } from 'lucide-react';
import { getEddyImageForCondition } from '@/constants';
import type { ConditionCode } from '@/types/api';

interface EddyOutlookFooterProps {
  riverSlug: string;
  conditionCode: ConditionCode;
  outlookSummary: string;
  isGuidance: boolean;
  fullReportText: string;
  fullReportLoading: boolean;
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
  conditionCode,
  outlookSummary,
  isGuidance,
  fullReportText,
  fullReportLoading,
  generatedAt,
  gaugeName,
  isOpen,
  onToggle,
  shareStatus,
  onShare,
}: EddyOutlookFooterProps) {
  return (
    <section id="eddy-says" className="scroll-mt-24 border-t border-neutral-200 bg-white" aria-labelledby="eddy-outlook-heading">
      <div className="px-4 py-4 sm:px-5 lg:grid lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center lg:gap-5">
        <div className="flex items-center gap-2.5">
          <Image
            src={getEddyImageForCondition(conditionCode)}
            alt=""
            width={44}
            height={44}
            className="h-11 w-11 flex-shrink-0 object-contain"
          />
          <h3 id="eddy-outlook-heading" className="whitespace-nowrap text-xs font-bold uppercase tracking-wide text-neutral-500">
            Eddy&apos;s take
          </h3>
        </div>

        <div className="mt-2 lg:mt-0">
          <p className="text-sm font-semibold leading-relaxed text-neutral-800" aria-live="polite">
            {outlookSummary}
          </p>
          {isGuidance && (
            <p className="mt-0.5 text-[10px] font-medium text-neutral-400">Guidance, not a river forecast.</p>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 lg:mt-0 lg:justify-end">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isOpen}
            aria-controls="eddy-full-report"
            className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-500 transition-colors hover:text-neutral-700"
          >
            {isOpen ? <>Show less <ChevronUp className="h-3 w-3" /></> : <>Full report <ChevronDown className="h-3 w-3" /></>}
          </button>
          <Link
            href={`/plan?river=${riverSlug}`}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#163F4A] px-3.5 py-2 text-xs font-semibold text-white shadow-[2px_2px_0_#0F2D35] transition-colors hover:bg-[#1A4A57]"
          >
            Plan a Trip
          </Link>
          <button
            type="button"
            onClick={onShare}
            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-800 shadow-[2px_2px_0_#C2BAAC] transition-colors hover:bg-neutral-50"
          >
            {shareStatus === 'copied' ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
            {shareStatus === 'copied' ? 'Copied!' : 'Share'}
          </button>
        </div>
      </div>

      {isOpen && (
        <div id="eddy-full-report" className="border-t border-neutral-100 px-4 py-4 sm:px-5">
          {fullReportLoading ? (
            <p className="text-sm italic text-neutral-500">Loading Eddy&apos;s full report…</p>
          ) : (
            <p className="text-sm font-medium leading-relaxed text-neutral-700">&ldquo;{fullReportText}&rdquo;</p>
          )}
          {(generatedAt || gaugeName) && !fullReportLoading && (
            <p className="mt-2 text-[10px] text-neutral-400">
              {generatedAt ? updatedLabel(generatedAt) : null}
              {generatedAt && gaugeName ? ' · ' : null}
              {gaugeName ? `via ${gaugeName}` : null}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
